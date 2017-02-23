'use strict';
const fs     = require('fs');
const Parser = require('./binary-message-parser');

const rawData = Buffer.from([0, 0, 0, 8, 0, 0, 0, 5, 0, 0, 0, 8, 0, 1, 0, 0]);

const parser = new Parser(Parser.HeaderExtractorInt32BE, 8);

// message is a Buffer containing all of the message bytes including header
parser.on('message', message => {
	console.log('message size:', message.readInt32BE(0),
	            'data:', message.readInt32BE(4));
});

parser.on('error', (err, args) => {
	console.log('error:', err, args);
});

// manually provide parser with the data
parser.parseBytes(rawData);

// create file and pipe its contents to the parser
const filePath = './test2.dat';
fs.writeFileSync(filePath, rawData);
fs.createReadStream(filePath)
	.pipe(parser)
	.on('finish', () => { fs.unlinkSync(filePath); });
