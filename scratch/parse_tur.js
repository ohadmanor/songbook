const parser = require('./web/parser.js');
const fs = require('fs');

const songs = JSON.parse(fs.readFileSync('./web/songs.json', 'utf8'));
const song = songs.find(s => s.title.includes('עטור מצחך'));

const blocks = parser.parseSongText(song.rawText);
console.log(JSON.stringify(blocks, null, 2));
