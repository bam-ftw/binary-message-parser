# Binary Message Parser

Parses headers of binary messages to extract all of their bytes. Designed to
handle data incoming from TCP sockets.

Can handle parts of messages at the time and works with pipes.

# Example

```javascript
const fs     = require('fs');
const Parser = require('binary-message-parser');

const rawData = Buffer.from([0, 0, 0, 8, 0, 0, 0, 5, 0, 0, 0, 8, 0, 1, 0, 0]);

// parser requires header extractor object which determines sizes of messages
// from their header bytes
const parser = new Parser(Parser.HeaderExtractorInt32BE);

// message is a Buffer containing all of the message bytes including header
parser.on('message', message => {
	console.log('message size:', message.readInt32BE(0),
	            'data:', message.readInt32BE(4));
});

parser.on('error', (err, args) => {
	console.log('error:', err, args);
});

// give data to the parser manually
parser.parseBytes(rawData);

// create file and pipe its contents to the parser
const filePath = './test.dat';
fs.writeFileSync(filePath, rawData);
fs.createReadStream(filePath)
	.pipe(parser)
	.on('finish', () => { fs.unlinkSync(filePath); });

```

# Header Extractor

Header extractor is an object responsible for determining size of the message
based on given header bytes.

Header extractors for some POD data types are available:

```javascript
const Parser = require('binary-message-parser');

Parser.HeaderExtractorInt8
Parser.HeaderExtractorInt16LE
Parser.HeaderExtractorInt16BE
Parser.HeaderExtractorInt32LE
Parser.HeaderExtractorInt32BE
```

Example of custom header extractor:

```javascript
var customHeaderExtractor = {
	// number indicating number of bytes header consists of
	headerByteCount     : 6,

	/*
	 * this method returns number of bytes message consists of (including
	 * header bytes)
	 * @param {Buffer} buffer contains header bytes
	 */
	extractMessageSize  : buffer => {
		return buffer.readInt16BE(0) + buffer.readInt32BE(2);
	},

	/*
	 * this method is optional, by default always returns true
	 * returns true if message size is in valid range, false otherwise
	 * when false is returned 'error' event is emitted and parser object is
	 * shutdown (no longer usable).
	 * @param {Number} message size
	 */
	validateMessageSize : size => {
		return size >= headerByteCount;
	},
}
```


# Tests
```
mocha
```