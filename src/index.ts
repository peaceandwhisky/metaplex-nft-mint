import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type { Commitment } from '@solana/web3.js';
import { Metaplex, keypairIdentity, bundlrStorage, toMetaplexFile } from '@metaplex-foundation/js';
import type { Nft } from '@metaplex-foundation/js';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import bs58 from 'bs58';

dotenv.config();

type Network = 'mainnet' | 'devnet';

interface NetworkConfig {
  rpcUrl: string;
  bundlrAddress: string;
  name: string;
}

const NETWORK_CONFIGS: Record<Network, NetworkConfig> = {
  mainnet: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    bundlrAddress: 'https://node1.bundlr.network',
    name: 'Mainnet Beta'
  },
  devnet: {
    rpcUrl: 'https://api.devnet.solana.com',
    bundlrAddress: 'https://devnet.bundlr.network',
    name: 'Devnet'
  }
};

async function main() {
  // コマンドライン引数からネットワークを取得（デフォルトはdevnet）
  const network: Network = (process.argv[2] as Network) || 'devnet';
  const config = NETWORK_CONFIGS[network];

  // Configure Solana connection
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || config.rpcUrl,
    {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 120000, // 2分
      wsEndpoint: process.env.SOLANA_WS_URL,
    }
  );

  // 秘密鍵の読み込みとウォレットの設定
  if (!process.env.WALLET_PRIVATE_KEY) {
    throw new Error('WALLET_PRIVATE_KEY is not set in .env file');
  }

  const privateKey = bs58.decode(process.env.WALLET_PRIVATE_KEY);
  const wallet = Keypair.fromSecretKey(privateKey);

  // Configure Metaplex with Bundlr
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(wallet))
    .use(bundlrStorage({
      address: config.bundlrAddress,
      providerUrl: process.env.SOLANA_RPC_URL || config.rpcUrl,
      timeout: 120000, // 2分
    }));

  console.log('NFT minting environment is ready.');
  console.log('Wallet public key:', wallet.publicKey.toString());
  console.log('Network:', config.name);
  console.log('注意: Bundlrストレージの使用には約0.1 SOLが必要です。');
  console.log('RPC URL:', process.env.SOLANA_RPC_URL || config.rpcUrl);

  try {
    // 1. 画像ファイルを読み込む
    const imageBuffer = fs.readFileSync('./assets/image.png');
    const imageFile = toMetaplexFile(imageBuffer, 'image.png');

    // 2. 画像をアップロード（リトライロジック付き）
    let imageUri: string | undefined;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        imageUri = await metaplex.storage().upload(imageFile);
        console.log('Image uploaded:', imageUri);
        break;
      } catch (error: unknown) {
        retryCount++;
        if (retryCount === maxRetries) throw error;
        console.log(`Upload failed, retrying... (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒待機
      }
    }

    if (!imageUri) {
      throw new Error('Failed to upload image after all retries');
    }

    // 3. メタデータを作成
    const { uri: metadataUri } = await metaplex.nfts().uploadMetadata({
      name: 'My First Test NFT',
      description: `This is my first NFT on Solana ${config.name}`,
      image: imageUri,
      attributes: [
        { trait_type: 'hoge', value: 'test' }
      ],
    });
    console.log('Metadata uploaded:', metadataUri);

    // 4. NFTをミント（リトライロジック付き）
    let nft: Nft | undefined;
    retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const result = await metaplex.nfts().create({
          uri: metadataUri,
          name: 'My First Test NFT',
          sellerFeeBasisPoints: 0,
          symbol: 'TEST',
          isCollection: false,
          updateAuthority: wallet,
          mintAuthority: wallet,
          tokenStandard: 0, // NonFungible
        });
        nft = result.nft;
        break;
      } catch (error: unknown) {
        retryCount++;
        if (retryCount === maxRetries) throw error;
        console.log(`Minting failed, retrying... (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒待機
      }
    }

    if (!nft) {
      throw new Error('Failed to mint NFT after all retries');
    }

    console.log('NFT minted successfully!');
    console.log('NFT address:', nft.address.toString());
    console.log('NFT metadata:', nft.json);
  } catch (error) {
    console.error('Error minting NFT:', error);
  }
}

main().catch(console.error); 