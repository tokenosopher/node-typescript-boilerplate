import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
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

const downloadVideos = async ({ generationDir }: { generationDir: string }) => {
  try {
    const refreshResult = await lumaDreamMachine.refresh({ limit: 1 });
    console.log('Refresh result:', refreshResult);

    const completedVideos = refreshResult.filter(
      (item: any) => item.state === 'completed',
    );

    for (const video of completedVideos) {
      const videoId = video.id;
      const downloadUrlObject =
        await lumaDreamMachine.getVideoDownloadUrl(videoId);

      if (typeof downloadUrlObject === 'object' && 'url' in downloadUrlObject) {
        const downloadUrl = downloadUrlObject.url;
        console.log('Download URL:', downloadUrl);

        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const videoBuffer = await response.arrayBuffer();

        const videoFilePath = `${generationDir}/video_${videoId}.mp4`;
        fs.writeFileSync(videoFilePath, Buffer.from(videoBuffer));
        console.log(`Video ${videoId} downloaded to: ${videoFilePath}`);
      } else {
        console.error(`Invalid download URL format for video ${videoId}`);
      }
    }
  } catch (error) {
    console.error('Error downloading videos:', error);
  }
};

// Poll for video completion
const checkVideoStatus = async () => {
  try {
    const refreshResult = await lumaDreamMachine.refresh();
    console.log('Refresh result:', refreshResult);

    // Check if all videos are completed
    const allCompleted = refreshResult.every(
      (item: any) => item.state === 'completed',
    );

    if (allCompleted) {
      console.log('All videos are completed!');
      // Here you can add logic to download or process the completed videos
    } else {
      console.log(
        'Some videos are still processing. Checking again in 30 seconds...',
      );
      setTimeout(checkVideoStatus, 30000); // Check again after 30 seconds
    }
  } catch (error) {
    console.error('Error checking video status:', error);
  }
};

const createAIVideo = async (): Promise<void> => {
  const message = await anthropicClient.messages.create({
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
    model: 'claude-3-5-sonnet-20240620',
  });

  const currentDateAndTimeWithLines = new Date()
    .toLocaleString()
    .replace(/:/g, '_')
    .replace(/\//g, '_')
    .replace(/ /g, '_')
    .replace(/,/g, '_')
    .replace(/:/g, '_')
    .replace(/\\/g, '_');

  const generationDir = `./generations/generation-${currentDateAndTimeWithLines}`;
  fs.mkdirSync(generationDir, { recursive: true });

  const messageContent = message?.content?.[0];

  if (messageContent.type !== 'text') return;

  const messageText = messageContent.text;

  const storyboard = JSON.parse(messageText).stories;

  const textFilePath = `${generationDir}/generation-${currentDateAndTimeWithLines}.txt`;
  fs.writeFileSync(textFilePath, messageText);

  const imageFilePaths: string[] = [];

  for (const [index, story] of storyboard.entries()) {
    const dallePrompt = story.story;
    const imageResponse = await openAIClient.images.generate({
      prompt: dallePrompt,
      n: 1,
      size: '1792x1024',
      model: 'dall-e-3',
    });

    const imageUrl = imageResponse.data[0].url;
    const imageBuffer = await (await fetch(imageUrl)).arrayBuffer();

    const imageFilePath = `${generationDir}/story_${index + 1}.png`;
    fs.writeFileSync(imageFilePath, Buffer.from(imageBuffer));
    imageFilePaths.push(imageFilePath);
  }

  // Create videos using LumaDreamMachine
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
    } catch (error) {
      console.error(`Error creating video ${i + 1}:`, error.data.detail);
    }
  }

  // Start checking video status
  checkVideoStatus();

  // Start downloading the completed videos
  downloadVideos({
    generationDir,
  });
};

const main = async (): Promise<void> => {
  await createAIVideo();
};

downloadVideos({
  generationDir: './generations/generation-15_08_2024__02_30_01',
});

// await lumaDreamMachine.refresh();
