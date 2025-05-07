import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { generateSigner, keypairIdentity } from '@metaplex-foundation/umi';
import { createTree } from '@metaplex-foundation/mpl-bubblegum';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  // UMIのインスタンスを作成
  const umi = createUmi('https://api.devnet.solana.com')
    .use(mplBubblegum());

  // 新しいSignerを生成
  const signer = generateSigner(umi);
  umi.use(keypairIdentity(signer));

  try {
    // Merkle Treeを作成
    const merkleTree = generateSigner(umi);
    const builder = await createTree(umi, {
      merkleTree,
      maxDepth: 14,
      maxBufferSize: 64,
    });

    // トランザクションを送信
    const result = await builder.sendAndConfirm(umi);
    console.log('Merkle Tree created:', result);

    // ここでCompressed NFTのミント処理を実装
    // メタデータの作成とミント処理は別途実装が必要です

  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
