// src/services/videoService.js
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const path = require('path');
const fs = require('fs').promises;

class VideoService {
  constructor() {
    // Tự động dùng ffmpeg và ffprobe từ npm package
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
    ffmpeg.setFfprobePath(ffprobeInstaller.path);
    
    console.log(' FFmpeg:', ffmpegInstaller.path);
    console.log(' FFprobe:', ffprobeInstaller.path);
  }

  /**
   * Convert images to video
   * @param {string} encodeName - Encoded name of the record (folder name)
   * @param {number} fps - Frames per second (default: 10)
   * @returns {Promise<string>} - Path to the created video file
   */
  async convertImagesToVideo(encodeName, fps = 10) {
    try {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const imageFolder = path.join(uploadsDir, encodeName);
      const outputVideo = path.join(uploadsDir, `${encodeName}.mp4`);

      // Check if video already exists
      try {
        await fs.access(outputVideo);
        console.log(` Video already exists: ${outputVideo}`);
        return outputVideo;
      } catch {
        
      }

      // Check if image folder exists
      try {
        await fs.access(imageFolder);
      } catch {
        throw new Error(`Image folder not found: ${imageFolder}`);
      }

      // Get list of images
      const files = await fs.readdir(imageFolder);
      const imageFiles = files
        .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
        .sort((a, b) => {
          // Sort by timestamp in filename
          const timestampA = parseInt(a.match(/\d+/)?.[0] || '0');
          const timestampB = parseInt(b.match(/\d+/)?.[0] || '0');
          return timestampA - timestampB;
        });

      if (imageFiles.length === 0) {
        throw new Error('No images found in folder');
      }

      console.log(` Converting ${imageFiles.length} images to video...`);

      // Create video using ffmpeg
      await this.createVideoFromImages(imageFolder, outputVideo, fps);

      console.log(` Video created successfully: ${outputVideo}`);
      return outputVideo;

    } catch (error) {
      console.error(' Error converting images to video:', error);
      throw error;
    }
  }

  /**
   * Create video from images using ffmpeg
   * @param {string} imageFolder - Folder containing images
   * @param {string} outputPath - Output video path
   * @param {number} fps - Frames per second
   */
  createVideoFromImages(imageFolder, outputPath, fps) {
    return new Promise((resolve, reject) => {
      // Pattern for input files (all jpg/jpeg files sorted by name)
      const inputPattern = path.join(imageFolder, '*.jpg');

      ffmpeg()
        .input(inputPattern)
        .inputOptions([
          '-pattern_type glob',
          `-framerate ${fps}`
        ])
        .videoCodec('libx264')
        .outputOptions([
          '-pix_fmt yuv420p',
          '-crf 23', // Quality (lower = better, 23 is default)
          '-preset medium' // Encoding speed (ultrafast, fast, medium, slow)
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log(' FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(` Processing: ${progress.percent?.toFixed(2)}% done`);
        })
        .on('end', () => {
          console.log(' Video conversion completed');
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          console.error(' FFmpeg error:', err.message);
          console.error('FFmpeg stderr:', stderr);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Check if video exists for a record
   * @param {string} encodeName - Encoded name of the record
   * @returns {Promise<boolean>}
   */
  async videoExists(encodeName) {
    try {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const videoPath = path.join(uploadsDir, `${encodeName}.mp4`);
      console.log(videoPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get video path
   * @param {string} encodeName - Encoded name of the record
   * @returns {string}
   */
  getVideoPath(encodeName) {
    const uploadsDir = path.join(__dirname, '../../uploads');
    return path.join(uploadsDir, `${encodeName}.mp4`);
  }

  /**
   * Get video info
   * @param {string} videoPath - Path to video file
   * @returns {Promise<object>}
   */
  getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const videoStream = metadata.streams.find(s => s.codec_type === 'video');
          resolve({
            duration: metadata.format.duration,
            size: metadata.format.size,
            width: videoStream?.width,
            height: videoStream?.height,
            fps: eval(videoStream?.r_frame_rate) // Convert "30/1" to 30
          });
        }
      });
    });
  }

  /**
   * Delete video file
   * @param {string} encodeName - Encoded name of the record
   */
  async deleteVideo(encodeName) {
    try {
      const videoPath = this.getVideoPath(encodeName);
      await fs.unlink(videoPath);
      console.log(` Video deleted: ${videoPath}`);
    } catch (error) {
      console.error(' Error deleting video:', error);
    }
  }

  /**
   * Preprocess video for streaming (create optimized version)
   * @param {string} encodeName - Encoded name of the record
   * @returns {Promise<string>} - Path to optimized video
   */
  async preprocessVideoForStreaming(encodeName) {
    try {
      const inputPath = this.getVideoPath(encodeName);
      const outputPath = this.getVideoPath(`${encodeName}_optimized`);

      // Check if already preprocessed
      try {
        await fs.access(outputPath);
        return outputPath;
      } catch {
        // Not preprocessed yet
      }

      console.log(` Preprocessing video for streaming: ${encodeName}`);

      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            '-movflags faststart', // Enable progressive download
            '-crf 28', // Slightly lower quality for faster streaming
            '-preset veryfast'
          ])
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      console.log(` Video preprocessed: ${outputPath}`);
      return outputPath;

    } catch (error) {
      console.error(' Error preprocessing video:', error);
      // Return original video if preprocessing fails
      return this.getVideoPath(encodeName);
    }
  }
}

module.exports = new VideoService();