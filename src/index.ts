import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Metaplex, keypairIdentity, bundlrStorage } from '@metaplex-foundation/js';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  // Configure Solana connection (using devnet)
  const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com');

  // Configure wallet
  // Note: In production, you need to load the private key from .env file
  const wallet = Keypair.generate(); // Generate new keypair for testing

  // Configure Metaplex
  // keypairIdentity: Used for wallet authentication
  // bundlrStorage: Storage for NFT metadata and images
  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(wallet))
    .use(bundlrStorage());

  console.log('NFT minting environment is ready.');
  console.log('Wallet public key:', wallet.publicKey.toString());
}

main().catch(console.error); 