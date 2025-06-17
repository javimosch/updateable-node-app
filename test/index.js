//basic express app
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

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

app.get('/', (req, res) => {
  res.send(`
    
    <h1>Test App</h1>

    <input type="text" id="input" placeholder="Enter a value />
    <button id="save">Save</button>

    <script>
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
    
    `);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);

  setInterval(() => {
    console.log('tick tak v3');
  }, 1000);
});
