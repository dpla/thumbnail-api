import express from 'express';
import { exit } from 'process';
import thumb from './thumb';

const port = 3000;
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/thumb/*', thumb);

app.listen(port, () => {
  console.log(`Server is listening on ${port}`);
});
