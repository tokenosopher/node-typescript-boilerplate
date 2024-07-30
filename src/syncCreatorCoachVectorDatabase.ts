import { Index } from '@upstash/vector';

export type EmbeddingsMetadataType = {
  indexedInformation: string;
  informationToAppend?: string | null | undefined;
  dynamicDataVars?: string | string[] | null | undefined;
  aiFeature: 'AI_CREATOR_COACH' | 'AI_NOTES' | 'CHAT_TEXT_GENERATION';
};

// const syncCreatorCoachVectorFromLocalToProd = async () => {
//   //Initialize the local database
//   const localIndex = new Index({
//     url: process.env.UPSTASH_VECTOR_REST_URL_LOCAL,
//     token: process.env.UPSTASH_VECTOR_REST_TOKEN_LOCAL,
//   });

//   //Initialize the production database
//   const prodIndex = new Index({
//     url: process.env.UPSTASH_VECTOR_REST_URL_PROD,
//     token: process.env.UPSTASH_VECTOR_REST_TOKEN_PROD,
//   });

//   const localData = await localIndex.range<EmbeddingsMetadataType>({
//     cursor: 0,
//     limit: 1000,
//     includeMetadata: true,
//     includeVectors: true,
//   });

//   for (const data of localData.vectors) {
//     await prodIndex.upsert<EmbeddingsMetadataType>({
//       id: data.id,
//       vector: data.vector,
//       metadata: data.metadata,
//     });
//   }

//   return localData;
// };

const syncCreatorCoachVectorFromProdToLocal = async () => {
  //Initialize the local database
  const localIndex = new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL_LOCAL,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN_LOCAL,
  });

  //Initialize the production database
  const prodIndex = new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL_PROD,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN_PROD,
  });

  const prodData = await prodIndex.range<EmbeddingsMetadataType>({
    cursor: 0,
    limit: 1000,
    includeMetadata: true,
    includeVectors: true,
  });

  for (const data of prodData.vectors) {
    await localIndex.upsert<EmbeddingsMetadataType>({
      id: data.id,
      vector: data.vector,
      metadata: data.metadata,
    });
  }

  return prodData;

  console.log('Syncing from prod to local');
};

const main = async () => {
  await syncCreatorCoachVectorFromProdToLocal();
};

main();
