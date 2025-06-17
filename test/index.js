//basic express app
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const fs = require('fs')
const path = require('path')

app.use(express.json());

app.post('/api/envs', (req, res) => {
  const { name, content } = req.body;
  console.log(name, content);

  //create data folder if not exists (in __dirname)
  if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
  }

  //create env file
  fs.writeFileSync(path.join(__dirname, 'data', `${name}.env`), content);

  res.json({ message: 'Env saved' });
});

app.get('/api/envs/:name', (req, res) => {
  const { name } = req.params;
  console.log(name);

  //read env file
  const content = fs.readFileSync(path.join(__dirname, 'data', `${name}.env`), 'utf-8');

  res.json({ name, content });
});

app.get('/', (req, res) => {
  res.send(`
    <body>
    <h1>Test App</h1>

    <input type="text" id="input" placeholder="Enter a value" />
    <button id="load"> Load </button>
    <button id="save">Save</button>

    <script>

      document.getElementById('load').addEventListener('click', () => {
        const input = document.getElementById('input').value;
        fetch('/api/envs/test', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }).then((r) => {
          r.json().then((data) => {
            document.getElementById('input').value = data.content;
          });
        });
      });

      document.getElementById('save').addEventListener('click', () => {
        const input = document.getElementById('input').value;
        fetch('/api/envs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'test', content: input }),
        }).then(() => {
          alert('Env saved');
        });
      });
    </script>

    <style>
      body {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
        font-family: Arial, sans-serif;
        background-color: #f0f0f0;
        color: #333;
      }
    </style>
    `);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);

  setInterval(() => {
    console.log('tick tak v3');
  }, 1000);
});
