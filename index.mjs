import Express from 'express';
import axios from 'axios';
import fkill from 'fkill';
import { spawn } from 'child_process';

const app = Express();
app.use(Express.json());

const playlist = [];

const play = async () => {
  if (playlist[0]?.isPlaying) return;

  playlist[0].isPlaying = true;
  spawn('open', [playlist[0].url]);
};

const stop = async () => {
  try {
    await fkill('Brave Browser');
  } catch (error) {
    return error;
  }
};

app.get('/playlist', (_req, res) => {
  res.send(playlist);
});

app.post('/push', async (req, res) => {
  const { url } = req.body;
  console.log('/push', url);

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

  playlist.push({ url, title, duration, isPlaying: false });

  res.send({ success: true });
});

app.post('/stop', (_req, res) => {
  if (playlist.length === 0) {
    return res.send({ success: false });
  }

  playlist[0].duration = -42; // 讓 playlist loop 移除這首歌
  res.send({ success: true });
});

app.use(Express.static('./public'));

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

    if (!playlist[0].isPlaying) {
      return play();
    }

    playlist[0].duration -= 1000;
    if (playlist[0].duration > 0) return;

    playlist.shift();
    stop();
    coolDown = 1000;
  }, 1000);
});
