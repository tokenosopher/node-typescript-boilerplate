import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import NodeDreamMachineAPI from './NodeDreamMachineAPI.js';
import OpenAI from 'openai';
import fetch from 'node-fetch';

const anthropicClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const lumaDreamMachine = new NodeDreamMachineAPI(process.env.LUMA_ACCESS_TOKEN);

const openAIClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const lyrics = `
Oh, it feels like
I'm fallin' in love
Maybe for the first time
Baby, it's my mind you blow
It feels like
I'm fallin' in love
You're throwin' me a lifeline
This is for a lifetime, I know
`;

const videoTime = 10;
const numberOfStories = videoTime / 5;

const prompt = `Create the prompts for a series of images inspired by these lyrics:

${lyrics}

Create a storyboard, with prompts for an AI image generator. Each image should follow naturally from the previous one, with at least some common elements, and the description should reflect that.
Please describe the common elements in great detail in each story. 

Please structure your response in json format, with the following structure:
  
  {
    "stories": [
      {
        "story": insert story here
        "transition": insert transition description from this story to the next here
      },
      {
        "story": insert story here
        "transition": insert transition description from this story to the next here
      },
      {
        "story": insert story here
        "transition": insert transition description from this story to the next here
      }
        ...
    ]
  }

Create ${numberOfStories} stories in the storyboard.`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const downloadVideos = async ({
  generationDir,
  videoIds,
}: {
  generationDir: string;
  videoIds: string[];
}) => {
  console.log('Downloading videos...');
  try {
    const videosDir = path.join(generationDir, 'videos');
    fs.mkdirSync(videosDir, { recursive: true });

    for (let i = 0; i < videoIds.length; i++) {
      const refreshResult = await lumaDreamMachine.refresh({ limit: 100 });
      const video = refreshResult.find(
        (item: any) => item.id === videoIds[i] && item.state === 'completed',
      );

      if (video) {
        const downloadUrlObject = await lumaDreamMachine.getVideoDownloadUrl(
          videoIds[i],
        );

        if (
          typeof downloadUrlObject === 'object' &&
          'url' in downloadUrlObject
        ) {
          const downloadUrl = downloadUrlObject.url;
          console.log('Download URL:', downloadUrl);

          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const videoBuffer = await response.arrayBuffer();

          const videoFilePath = path.join(
            videosDir,
            `scene_${i + 1}_${videoIds[i]}.mp4`,
          );
          fs.writeFileSync(videoFilePath, Buffer.from(videoBuffer));
          console.log(`Video ${videoIds[i]} downloaded to: ${videoFilePath}`);
        } else {
          console.error(`Invalid download URL format for video ${videoIds[i]}`);
        }
      } else {
        console.log(`Video ${videoIds[i]} not yet completed or not found.`);
      }
    }
  } catch (error) {
    console.error('Error downloading videos:', error);
  }
};

const checkVideoStatus = async (videoIds: string[]) => {
  console.log('Checking video status for videos:', { videoIds });
  try {
    const refreshResult = await lumaDreamMachine.refresh({
      limit: 100,
    });

    const allCompleted = videoIds.every((id) =>
      refreshResult.some(
        (item: any) => item.id === id && item.state === 'completed',
      ),
    );

    if (allCompleted) {
      console.log('All videos are completed!');
      return true;
    } else {
      console.log(
        'Some videos are still processing. Checking again in 30 seconds...',
      );
      await sleep(30000);
      return checkVideoStatus(videoIds);
    }
  } catch (error) {
    console.error('Error checking video status:', error);
    return false;
  }
};

const createAIVideo = async (): Promise<void> => {
  console.log('Creating storyboard text...');
  const message = await anthropicClient.messages.create({
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
    model: 'claude-3-5-sonnet-20240620',
  });

  const currentDateAndTimeWithLines = new Date()
    .toLocaleString()
    .replace(/[/:]/g, '_')
    .replace(/,/g, '')
    .replace(/ /g, '_');

  const generationDir = `./generations/generation-${currentDateAndTimeWithLines}`;
  const imagesDir = path.join(generationDir, 'images');
  fs.mkdirSync(imagesDir, { recursive: true });

  const messageContent = message?.content?.[0];
  if (messageContent.type !== 'text') return;

  const messageText = messageContent.text;
  const storyboard = JSON.parse(messageText).stories;

  const textFilePath = path.join(
    generationDir,
    `generation-${currentDateAndTimeWithLines}.txt`,
  );
  fs.writeFileSync(textFilePath, messageText);

  const imageFilePaths: string[] = [];
  const batchSize = 7;
  const batchDelay = 70000; // 1 minute and 10 seconds

  console.log('Creating storyboard images...');
  for (let i = 0; i < storyboard.length; i += batchSize) {
    const batch = storyboard.slice(i, i + batchSize);
    const batchPromises = batch.map(async (story, index) => {
      const dallePrompt = story.story;
      const imageResponse = await openAIClient.images.generate({
        prompt: dallePrompt,
        n: 1,
        size: '1792x1024',
        model: 'dall-e-3',
      });

      const imageUrl = imageResponse.data[0].url;
      const imageBuffer = await (await fetch(imageUrl)).arrayBuffer();

      const imageFilePath = path.join(imagesDir, `story_${i + index + 1}.png`);
      fs.writeFileSync(imageFilePath, Buffer.from(imageBuffer));
      imageFilePaths.push(imageFilePath);
    });

    await Promise.all(batchPromises);

    if (i + batchSize < storyboard.length) {
      console.log(`Waiting ${batchDelay / 1000} seconds before next batch...`);
      await sleep(batchDelay);
    }
  }

  const videoIds: string[] = [];

  console.log('Creating videos...');
  for (let i = 0; i < imageFilePaths.length - 1; i++) {
    const startImagePath = imageFilePaths[i];
    const endImagePath = imageFilePaths[i + 1];
    const transitionPrompt = storyboard[i].transition;

    try {
      const result = await lumaDreamMachine.make({
        prompt: transitionPrompt,
        imgFile: startImagePath,
        imgEndFile: endImagePath,
        aspectRatio: '16:9',
      });

      console.log(`Video ${i + 1} creation started:`, result);
      videoIds.push(result[0].id);
    } catch (error) {
      console.error(
        `Error creating video ${i + 1}:`,
        error.data?.detail || error,
      );
    }
  }

  // Wait for all videos to complete
  const allCompleted = await checkVideoStatus(videoIds);

  if (allCompleted) {
    console.log('Downloading videos...');
    await downloadVideos({
      generationDir,
      videoIds,
    });
  }
};

const main = async (): Promise<void> => {
  await createAIVideo();
  // await checkVideoStatus([
  //   '100ca924-e6d4-4eb3-bed4-8cf034e1e5be',
  //   '738027d5-727c-4657-9775-2109b3e2d2a5',
  // ]);
};

main();
