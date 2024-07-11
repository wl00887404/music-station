import Express from 'express';
import axios from 'axios';
import fkill from 'fkill';
import { spawn } from 'child_process';

const app = Express();
app.use(Express.json());

const playlist = [];

const stop = async () => {
  if (playlist[0].isPlaying) playlist.shift();

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

  const bufferTime = 3;
  const duration = (minutes * 60 + seconds + bufferTime) * 1000;

  playlist.push({ url, title, duration, isPlaying: false });

  res.send({ success: true });
});

app.post('/stop', (_req, res) => {
  console.log('/stop');
  stop().then(error => {
    if (error) {
      res.send({ success: false, message: error.toString() });
    }

    return res.send({ success: true });
  });
});

app.use(Express.static('./public'));

app.listen(3000, () => {
  console.log('Server is on http://localhost:3000');

  setInterval(() => {
    if (!playlist[0]) return;

    if (!playlist[0].isPlaying) {
      playlist[0].isPlaying = true;
      spawn('open', [playlist[0].url]);
      return;
    }

    playlist[0].duration -= 1000;
    if (playlist[0].duration > 0) return;

    stop();
  }, 1000);
});
