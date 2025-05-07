import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplBubblegum, createTree, mintV1 } from '@metaplex-foundation/mpl-bubblegum';
import { generateSigner, keypairIdentity, signerIdentity, SolAmount, publicKey } from '@metaplex-foundation/umi';
import { bundlrUploader } from '@metaplex-foundation/umi-uploader-bundlr';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as csv from 'csv-parse/sync';
import bs58 from 'bs58';
import { Keypair, Connection } from '@solana/web3.js';

dotenv.config();

interface UserData {
  id: string;
  linked_accounts: string;
}

interface LinkedAccount {
  type: string;
  chain_type: string;
  address: string;
}

interface SendTransactionError extends Error {
  transactionLogs?: string[];
}

async function extractSolanaAddresses(csvPath: string): Promise<string[]> {
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records = csv.parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  });

  const solanaAddresses: string[] = [];
  
  for (const record of records) {
    const userData = record as UserData;
    const linkedAccounts = JSON.parse(userData.linked_accounts) as LinkedAccount[];
    
    // Find Solana wallet address
    const solanaWallet = linkedAccounts.find((account) => 
      account.type === 'wallet' && account.chain_type === 'solana'
    );
    
    if (solanaWallet) {
      solanaAddresses.push(solanaWallet.address);
    }
  }

  return solanaAddresses;
}

async function main() {
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('WALLET_PRIVATE_KEY is not set in .env file');
  }

  // Create UMI instance
  const umi = createUmi('https://api.devnet.solana.com')
    .use(mplBubblegum())
    .use(bundlrUploader());

  // Check RPC connection
  try {
    const slot = await umi.rpc.getSlot();
    console.log('Current slot:', slot);
    
    const blockTime = await umi.rpc.getBlockTime(slot);
    if (blockTime) {
      console.log('Block time:', new Date(Number(blockTime) * 1000).toISOString());
    }
  } catch (error) {
    console.error('Failed to connect to RPC:', error);
    return;
  }

  // Create signer from private key
  const secretKey = bs58.decode(privateKey);
  const keypair = Keypair.fromSecretKey(secretKey);
  umi.use(keypairIdentity({
    publicKey: publicKey(keypair.publicKey.toString()),
    secretKey: secretKey,
  }));

  // Display wallet address
  console.log('Wallet address:', keypair.publicKey.toString());

  // Check wallet balance using web3.js Connection
  try {
    const connection = new Connection('https://api.devnet.solana.com');
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('Raw balance:', balance);
    const balanceInSol = balance / 1e9;
    console.log('Wallet balance:', balanceInSol, 'SOL');

    if (balanceInSol < 1) {
      console.log('Insufficient balance. Please run the following command to get SOL airdrop:');
      console.log(`solana airdrop 2 ${keypair.publicKey.toString()} --url devnet`);
      return;
    }
  } catch (error) {
    console.error('Failed to get balance:', error);
    return;
  }

  // Create Merkle tree
  const merkleTree = generateSigner(umi);
  console.log('Creating Merkle tree...');
  const builder = await createTree(umi, {
    merkleTree,
    maxDepth: 15,
    maxBufferSize: 64,
  });
  await builder.sendAndConfirm(umi);
  console.log('Merkle tree created:', merkleTree.publicKey);

  // Create metadata
  const metadata = {
    name: 'My Compressed NFT',
    symbol: 'MCNFT',
    description: 'This is a compressed NFT',
    image: 'https://arweave.net/UiXkg2lr2zK5V2mMig1tqkjeV1dOZyGg_53rFeIUAhQ',
    attributes: [
      {
        trait_type: 'Background',
        value: 'Blue',
      },
    ],
    properties: {
      files: [
        {
          uri: 'https://arweave.net/UiXkg2lr2zK5V2mMig1tqkjeV1dOZyGg_53rFeIUAhQ',
          type: 'image/png',
        },
      ],
    },
  };

  // Upload metadata to Arweave using Bundlr
  const metadataUri = await umi.uploader.uploadJson(metadata);
  console.log('Metadata uploaded:', metadataUri);

  // Read CSV file
  const csvPath = path.join(process.cwd(), 'users.sample.csv');
  console.log('Reading CSV file from:', csvPath);
  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  
  const records = csv.parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
  });

  // Extract Solana addresses
  const solanaAddresses: string[] = [];
  for (const record of records) {
    try {
      // PythonのNoneをnullに変換し、シングルクォートをダブルクォートに変換
      const jsonStr = record.linked_accounts
        .replace(/'/g, '"')
        .replace(/None/g, 'null')
        .replace(/False/g, 'false')
        .replace(/True/g, 'true');
      
      const linkedAccounts = JSON.parse(jsonStr) as LinkedAccount[];
      const solanaWallet = linkedAccounts.find((account) => 
        account.type === 'wallet' && account.chain_type === 'solana'
      );
      
      if (solanaWallet) {
        solanaAddresses.push(solanaWallet.address);
      }
    } catch (error) {
      console.error('Error parsing linked_accounts:', error);
      console.error('Problematic JSON string:', record.linked_accounts);
    }
  }

  console.log('Found Solana addresses:', solanaAddresses);

  // Batch mint NFTs
  const batchSize = 5;
  for (let i = 0; i < solanaAddresses.length; i += batchSize) {
    const batch = solanaAddresses.slice(i, i + batchSize);
    console.log(`Minting batch ${i / batchSize + 1} of ${Math.ceil(solanaAddresses.length / batchSize)}...`);

    for (const address of batch) {
      try {
        const leafOwner = publicKey(address);
        const mintBuilder = await mintV1(umi, {
          leafOwner,
          merkleTree: merkleTree.publicKey,
          metadata: {
            name: metadata.name,
            symbol: metadata.symbol,
            uri: metadataUri,
            sellerFeeBasisPoints: 0,
            creators: [],
            collection: null,
            uses: null,
          },
        });
        await mintBuilder.sendAndConfirm(umi);
        console.log(`Minted NFT for address: ${address}`);
      } catch (error) {
        console.error(`Failed to mint NFT for address: ${address}`);
        if (error instanceof Error) {
          console.error('Error details:', error.message);
          const sendError = error as SendTransactionError;
          if (sendError.transactionLogs) {
            console.error('Transaction logs:', sendError.transactionLogs);
          }
        }
      }
    }

    // Wait between batches to avoid rate limiting
    if (i + batchSize < solanaAddresses.length) {
      console.log('Waiting 2 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

main().catch(console.error);
