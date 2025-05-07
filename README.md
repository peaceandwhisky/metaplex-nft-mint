# Metaplex Compressed NFT Mint

A tool for minting Compressed NFTs on Solana's mainnet and devnet using Metaplex's Bubblegum program.

## Prerequisites

- Node.js (v16 or higher)
- pnpm
- Solana CLI
- Wallet (Phantom, etc.)

## Setup

1. Clone the repository
```bash
git clone <repository-url>
cd metaplex-nft-mint
```

2. Install dependencies
```bash
pnpm install
```

3. Configure environment variables
Create a `.env` file with the following content:
```env
# Solana RPC URL (Optional: Not required if using default RPC)
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# WebSocket URL (Optional)
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com
# Wallet private key (base58 format)
WALLET_PRIVATE_KEY=your_private_key_here
```

## Usage

### Running on Devnet

```bash
# Devnet is used by default
pnpm start

# Explicitly specify devnet
pnpm start devnet
```

### Running on Mainnet

```bash
pnpm start mainnet
```

## Required SOL

### Devnet
- Available through airdrop
```bash
solana airdrop 2 <wallet-address> --url devnet
```

### Mainnet
- Approximately 0.1 SOL or more required
  - Merkle Tree creation costs
  - Transaction fees

## Image Preparation

1. Create `./assets` directory
```bash
mkdir assets
```

2. Place your NFT image as `./assets/image.png`

## Important Notes

- Exercise caution when running on mainnet as it involves real assets
- Never expose your private key
- Add `.env` to `.gitignore` to prevent committing it to the Git repository

## Troubleshooting

### Transaction Timeout
- Change RPC provider
- Consider using more reliable RPC providers (QuickNode, Alchemy, etc.)

### Upload Failures
- Ensure sufficient SOL balance
- Check image size (recommended: under 1MB)

## Verification Methods

### Devnet
- Solana Explorer (Devnet): https://explorer.solana.com/?cluster=devnet
- Solana FM (Devnet): https://solana.fm/?cluster=devnet

### Mainnet
- Solana Explorer: https://explorer.solana.com
- Solana FM: https://solana.fm
- Phantom Wallet

## Compressed NFT Features

- Significantly reduced storage costs compared to regular NFTs
- Efficient storage using Merkle Trees
- Batch minting capability
- Easy metadata updates

## License

MIT