// NodeDreamMachineAPI.ts

import axios from 'axios';
import fs from 'fs';

interface MakeOptions {
  prompt: string;
  imgFile?: string;
  imgEndFile?: string;
  aspectRatio?: string;
}

interface RefreshOptions {
  offset?: number;
  limit?: number;
}

interface SignedUploadResponse {
  presigned_url: string;
  public_url: string;
}

interface MakePayload {
  expand_prompt: true;
  image_end_url?: string;
  image_url?: string;
  loop: boolean;
  user_prompt: string;
  aspect_ratio?: string;
}

export class NodeDreamMachineAPI {
  private accessToken: string;
  private baseUrl: string =
    'https://internal-api.virginia.labs.lumalabs.ai/api/photon/v1';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request(
    method: string,
    endpoint: string,
    data?: unknown,
    params?: unknown,
  ) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      Cookie: `luma_session=${this.accessToken}`,
      Origin: 'https://lumalabs.ai',
      Referer: 'https://lumalabs.ai',
    };

    try {
      const response = await axios({
        method,
        url,
        data,
        params,
        headers,
      });
      return response.data;
    } catch (error) {
      console.error('Error in request:', error);
      throw error;
    }
  }

  async make({ prompt, imgFile, imgEndFile, aspectRatio }: MakeOptions) {
    const payload: MakePayload = {
      user_prompt: prompt,
      expand_prompt: true,
      loop: false,
      ...(aspectRatio && { aspect_ratio: aspectRatio }),
    };

    if (imgFile) {
      const imgUrl = await this.uploadFile(imgFile);
      payload.image_url = imgUrl;
    }

    if (imgEndFile) {
      const imgEndUrl = await this.uploadFile(imgEndFile);
      payload.image_end_url = imgEndUrl;
    }

    return this.request('POST', '/generations/', payload);
  }

  async refresh({ offset = 0, limit = 10 }: RefreshOptions = {}) {
    return this.request('GET', '/user/generations/', null, { offset, limit });
  }

  async getVideoDownloadUrl(videoId: string) {
    return this.request('GET', `/generations/${videoId}/download_video_url`);
  }

  private async getSignedUpload(): Promise<SignedUploadResponse> {
    return this.request('POST', '/generations/file_upload', null, {
      file_type: 'image',
      filename: 'file.jpg',
    });
  }

  private async uploadFile(filePath: string): Promise<string> {
    console.log('Uploading file:');
    const { presigned_url, public_url } = await this.getSignedUpload();

    const fileContent = await fs.promises.readFile(filePath);
    await axios.put(presigned_url, fileContent, {
      headers: {
        'Content-Type': 'image/*',
        Referer: 'https://lumalabs.ai/',
        Origin: 'https://lumalabs.ai',
        Cookie: `luma_session=${this.accessToken}`,
      },
    });

    return public_url;
  }
}

export default NodeDreamMachineAPI;
