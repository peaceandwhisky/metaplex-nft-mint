import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type { Commitment } from '@solana/web3.js';
import { Metaplex, keypairIdentity, bundlrStorage, toMetaplexFile } from '@metaplex-foundation/js';
import type { Nft } from '@metaplex-foundation/js';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import bs58 from 'bs58';
import { parse } from 'csv-parse/sync';

dotenv.config();

type Network = 'mainnet' | 'devnet';

interface NetworkConfig {
  rpcUrl: string;
  bundlrAddress: string;
  name: string;
}

interface User {
  id: string;
  solanaAddress?: string;
}

interface LinkedAccount {
  type: string;
  chain_type?: string;
  address?: string;
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

function extractSolanaAddress(linkedAccounts: string): string | undefined {
  try {
    // シングルクォートをダブルクォートに置換
    const normalizedJson = linkedAccounts
      .replace(/'/g, '"')
      .replace(/True/g, 'true')
      .replace(/False/g, 'false')
      .replace(/None/g, 'null');
    
    const accounts = JSON.parse(normalizedJson) as LinkedAccount[];
    const solanaAccount = accounts.find((account) => 
      account.type === 'wallet' && account.chain_type === 'solana'
    );
    return solanaAccount?.address;
  } catch (error) {
    console.error('Error parsing linked accounts:', error);
    console.error('Problematic JSON:', linkedAccounts);
    return undefined;
  }
}

function readUsersFromCSV(filePath: string): User[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  }) as Record<string, string>[];

  return records.map((record) => ({
    id: record.id,
    solanaAddress: extractSolanaAddress(record.linked_accounts)
  })).filter((user: User) => user.solanaAddress !== undefined);
}

async function mintNFTForUser(
  metaplex: Metaplex,
  user: User,
  imageUri: string,
  collectionNft: Nft
): Promise<void> {
  if (!user.solanaAddress) {
    throw new Error(`No Solana address found for user ${user.id}`);
  }

  try {
    // 個別のNFTのメタデータを作成
    const { uri: nftMetadataUri } = await metaplex.nfts().uploadMetadata({
      name: 'TestNFT',
      description: `This is a special NFT for user ${user.id} on Solana`,
      image: imageUri,
      attributes: [
        { trait_type: 'User ID', value: user.id },
        { trait_type: 'Solana Address', value: user.solanaAddress }
      ],
      properties: {
        category: 'image',
        files: [
          {
            uri: imageUri,
            type: 'image/png'
          }
        ]
      }
    });
    console.log(`NFT metadata uploaded for user ${user.id}:`, nftMetadataUri);

    // NFTをミント
    const result = await metaplex.nfts().create({
      uri: nftMetadataUri,
      name: 'TestNFT',
      sellerFeeBasisPoints: 0,
      symbol: 'TNFT',
      isCollection: false,
      collection: collectionNft.address,
      updateAuthority: metaplex.identity(),
      mintAuthority: metaplex.identity(),
      tokenStandard: 0, // NonFungible
    });

    const signature = result.response.signature;
    console.log(`NFT transaction signature for user ${user.id}:`, signature);
    
    const confirmation = await metaplex.connection.confirmTransaction(signature, 'confirmed');
    if (confirmation.value.err) {
      throw new Error(`NFT transaction failed for user ${user.id}: ${confirmation.value.err}`);
    }

    console.log(`NFT minted successfully for user ${user.id}:`, result.nft.address.toString());
  } catch (error) {
    console.error(`Error minting NFT for user ${user.id}:`, error);
    throw error;
  }
}

async function main() {
  // コマンドライン引数からネットワークを取得（デフォルトはdevnet）
  const network: Network = (process.argv[2] as Network) || 'devnet';
  const config = NETWORK_CONFIGS[network];

  // Configure Solana connection
  const connection = new Connection(
    process.env.SOLANA_RPC_URL || config.rpcUrl,
    {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 300000, // 5分
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
      timeout: 300000, // 5分
    }));

  console.log('NFT minting environment is ready.');
  console.log('Wallet public key:', wallet.publicKey.toString());
  console.log('Network:', config.name);
  console.log('注意: Bundlrストレージの使用には約0.1 SOLが必要です。');
  console.log('RPC URL:', process.env.SOLANA_RPC_URL || config.rpcUrl);

  try {
    // 1. Arweaveの画像URLを使用
    const imageUri = 'https://arweave.net/UiXkg2lr2zK5V2mMig1tqkjeV1dOZyGg_53rFeIUAhQ';
    console.log('Using image from Arweave:', imageUri);

    // 2. コレクションNFTのメタデータを作成
    const { uri: collectionMetadataUri } = await metaplex.nfts().uploadMetadata({
      name: 'My Collection NFT',
      description: `This is a collection NFT on Solana ${config.name}`,
      image: imageUri,
      attributes: [
        { trait_type: 'Network', value: config.name }
      ],
      properties: {
        category: 'image',
        files: [
          {
            uri: imageUri,
            type: 'image/png'
          }
        ]
      }
    });
    console.log('Collection metadata uploaded:', collectionMetadataUri);

    // 3. コレクションNFTをミント
    let collectionNft: Nft | undefined;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        const result = await metaplex.nfts().create({
          uri: collectionMetadataUri,
          name: 'My Collection NFT',
          sellerFeeBasisPoints: 0,
          symbol: 'MECOL',
          isCollection: true,
          updateAuthority: wallet,
          mintAuthority: wallet,
          tokenStandard: 0, // NonFungible
        });

        const signature = result.response.signature;
        console.log('Collection transaction signature:', signature);
        
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
        if (confirmation.value.err) {
          throw new Error(`Collection transaction failed: ${confirmation.value.err}`);
        }

        collectionNft = result.nft;
        console.log('Collection NFT minted successfully:', collectionNft.address.toString());
        break;
      } catch (error: unknown) {
        retryCount++;
        if (retryCount === maxRetries) throw error;
        console.log(`Collection minting failed, retrying... (${retryCount}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    if (!collectionNft) {
      throw new Error('Failed to mint collection NFT');
    }

    // 4. CSVファイルからユーザーを読み込み
    const users = readUsersFromCSV('./users.sample.csv');
    console.log(`Found ${users.length} users with Solana addresses`);

    // 5. 各ユーザーに対してNFTをミント
    for (const user of users) {
      console.log(`Minting NFT for user ${user.id} (${user.solanaAddress})...`);
      await mintNFTForUser(metaplex, user, imageUri, collectionNft);
      // トランザクション間の待機時間を設定（オプション）
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('All NFTs minted successfully!');
  } catch (error) {
    console.error('Error minting NFTs:', error);
  }
}

main().catch(console.error); 