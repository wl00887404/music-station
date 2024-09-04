import Express from 'express';
import axios from 'axios';
import fkill from 'fkill';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import loudness from 'loudness';
import cors from 'cors'; // 導入 cors

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Express();
app.use(Express.json());

// 使用 cors 中介軟體來開啟 CORS 支援
app.use(cors());

const playlist = [];
let previousVolume = null; // 用來儲存原始音量
let isPaused = false;

const play = async () => {
  if (playlist[0]?.isPlaying) return;

  playlist[0].isPlaying = true;
  const t = (playlist[0].duration - playlist[0].remainingTime) / 1000;

  console.log('play', playlist[0].url + `&t=${t}`);
  spawn('open', [playlist[0].url + `&t=${t}`]);
};

const stop = async () => {
  try {
    if (playlist.length > 0) {
      playlist[0].isPlaying = false;
    }
    await fkill('Brave Browser');
  } catch (error) {
    return error;
  }
};

app.get('/playlist', (_req, res) => {
  res.send(playlist);
});

const pushPlaylist = async (res, url) => {
  try {
    const { data } = await axios.get(url);

    const titleMatch = /<title>([^<]+)</.exec(data);
    const durationMatch = /itemprop="duration" content="PT([^"]+)"/.exec(data);

    if (titleMatch === null || durationMatch === null) {
      return res.send({ success: false, message: '無法取得影片時長' });
    }

    const title = titleMatch[1];
    const minutes = parseInt(/(\d+)M/.exec(durationMatch[1])[1]);
    const seconds = parseInt(/(\d+)S/.exec(durationMatch[1])[1]);

    const bufferTime = 1;
    const duration = (minutes * 60 + seconds + bufferTime) * 1000;
    const id = Date.now().toString(16);

    playlist.push({
      id,
      url,
      title,
      duration,
      remainingTime: duration,
      isPlaying: false,
    });

    res.send({ success: true });
  } catch (error) {
    console.error('Failed to fetch video data:', error);
    res
      .status(500)
      .send({ success: false, message: 'Failed to fetch video data' });
  }
};

app.get('/push', async (req, res) => {
  const { url } = req.query;
  console.log('push', url);

  pushPlaylist(res, url);
});

app.post('/push', async (req, res) => {
  const { url } = req.body;
  console.log('push', url);

  pushPlaylist(res, url);
});

app.post('/stop', (_req, res) => {
  if (playlist.length === 0) {
    return res.send({ success: false });
  }

  playlist[0].duration = -42; // 讓 playlist loop 移除這首歌
  res.send({ success: true });
});

app.post('/cancel', (req, res) => {
  const { songId } = req.body;
  const index = playlist.findIndex(song => song.id === songId);

  if (index === -1 || playlist[index].isPlaying) {
    return res.send({ success: false });
  }

  console.log('cancel', playlist[index]);

  playlist.splice(index, 1);
  res.send({ success: true });
});

app.post('/pause', (_req, res) => {
  isPaused = true;
  res.send({ success: true });
});

app.post('/resume', (_req, res) => {
  isPaused = false;
  res.send({ success: true });
});

app.post('/volume', async (req, res) => {
  const { action } = req.body;

  try {
    switch (action) {
      case 'up':
        const currentVolumeUp = await loudness.getVolume();
        await loudness.setVolume(Math.min(currentVolumeUp + 10, 100)); // 最大音量為 100
        break;
      case 'down':
        const currentVolumeDown = await loudness.getVolume();
        await loudness.setVolume(Math.max(currentVolumeDown - 10, 0)); // 最小音量為 0
        break;
      case 'mute':
        // 禁音的代碼
        previousVolume = await loudness.getVolume(); // 儲存當前音量
        await loudness.setVolume(0);
        break;
      case 'unmute':
        // 恢復原始音量
        if (previousVolume === null) break;
        await loudness.setVolume(previousVolume);
        previousVolume = null; // 重置
        break;
      default:
        return res.status(400).send('Invalid action');
    }
    res.send({ success: true });
  } catch (error) {
    console.error('Failed to adjust volume:', error);
    res
      .status(500)
      .send({ success: false, message: 'Volume adjustment failed' });
  }
});

app.use(Express.static(path.resolve(__dirname, './public')));

app.listen(3000, () => {
  console.log('Server is on http://localhost:3000');
  let coolDown = 0;

  // playlist loop
  setInterval(() => {
    if (coolDown > 0) {
      coolDown = Math.max(coolDown - 1000, 0);
      return;
    }
    if (playlist.length === 0) return;

    if (isPaused) {
      if (!playlist[0].isPlaying) return;

      coolDown = 1000;
      return stop();
    }

    if (!playlist[0].isPlaying) {
      return play();
    }

    playlist[0].remainingTime -= 1000;
    if (playlist[0].remainingTime > 0) return;

    playlist.shift();
    coolDown = 1000;
    stop();
  }, 1000);
});
