'use strict';
const expect = require('chai').expect;
const Parser = require('../binary-message-parser');
const fs     = require('fs');

describe('BinaryMessageParser', () => {


	it('should shutdown correctly', () => {
		const parser = new Parser(Parser.HeaderExtractorInt32BE);

		parser.on('message', message => {
			throw new Error('should not be called');
		});

		parser.on('error', (err, args) => {
			expect(args.size).to.equal(1);

			// valid message should be ignored
			console.log(err, args);
			const result = parser.parseBytes(Buffer.from([0, 0, 0, 4]));

			expect(result).to.equal(false);
		});

		const result = parser.parseBytes(Buffer.from([0, 0, 0, 1]));

		expect(result).to.equal(false);
	});

	it('should work with pipe', () => {
		const rawData = Buffer.from([0, 0, 0, 8, 0, 0, 0, 5, 0, 0, 0, 8, 0, 0, 0, 5]);
		const filePath = './test.dat';

		const parser = new Parser(Parser.HeaderExtractorInt32BE);
		parser.on('message', message => {
			expect(message.readInt32BE(0)).to.equal(8);
			expect(message.readInt32BE(4)).to.equal(6);
		});

		fs.writeFileSync(filePath, rawData);
		fs.createReadStream(filePath)
			.pipe(parser)
			.on('finish', () => { fs.unlinkSync(filePath); });
	});

	it('should work with i32 BE header', () => {
		const parser = new Parser(Parser.HeaderExtractorInt32BE);
		parser.on('message', message => {
			expect(message.readInt32BE(0)).to.equal(8);
			expect(message.readInt32BE(4)).to.equal(5);
		});

		parser.parseBytes(Buffer.from([0, 0, 0, 8, 0, 0, 0, 5]));
	});
});
