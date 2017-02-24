'use strict';
const expect = require('chai').expect;
const Parser = require('../index');
const fs     = require('fs');

describe('BinaryMessageParser', () => {
	it('should work with messages split into chunks', done => {
		const parser = new Parser(Parser.HeaderExtractorInt32BE);

		const parts = [
			Buffer.from([0, 0]),
			Buffer.from([0, 8]),
			Buffer.from([0, 0]),
			Buffer.from([0, 5]),
		];

		parser.on('message', message => {
			const value = message.readInt32BE(4);
			expect(value).to.equal(5);
			done();
		});

		parser.on('error', (err, args) => {
			done(err);
		});

		for (let part of parts) {
			parser.parseBytes(part);
		}
	});

	it('should shutdown correctly', () => {
		const parser = new Parser(Parser.HeaderExtractorInt32BE);

		parser.on('message', message => {
			throw new Error('on(\'message\') should not be called');
		});

		parser.on('error', (err, args) => {
			// at this point parser should be shutdown (no longer usable)
			expect(args.size).to.equal(1);

			// valid message should be ignored
			const result = parser.parseBytes(Buffer.from([0, 0, 0, 4]));

			expect(result).to.equal(false);
		});

		const result = parser.parseBytes(Buffer.from([0, 0, 0, 1]));

		expect(result).to.equal(false);
	});

	it('should work with pipe', (done) => {
		const rawData = Buffer.from([0, 0, 0, 8, 0, 0, 0, 5, 0, 0, 0, 8, 0, 0, 0, 5]);
		const filePath = './test.dat';

		const parser = new Parser(Parser.HeaderExtractorInt32BE);

		let messageCount = 0;

		parser.on('message', message => {
			expect(message.readInt32BE(0)).to.equal(8);
			expect(message.readInt32BE(4)).to.equal(5);

			if (++messageCount === 2) {
				done();
			}
		});

		fs.writeFileSync(filePath, rawData);
		fs.createReadStream(filePath)
			.pipe(parser)
			.on('finish', () => { fs.unlinkSync(filePath); });
	});

	for (let x of [
		{ name: 'int8', extractor: Parser.HeaderExtractorInt8, data: [ 5, 0, 0, 0, 5 ] },
		{ name: 'uint8', extractor: Parser.HeaderExtractorUInt8, data: [ 5, 0, 0, 0, 5 ] },

		{ name: 'int16 BE', extractor: Parser.HeaderExtractorInt16BE, data: [ 0, 6, 0, 0, 0, 5 ] },
		{ name: 'uint16 BE', extractor: Parser.HeaderExtractorUInt16BE, data: [ 0, 6, 0, 0, 0, 5 ] },
		{ name: 'int16 LE', extractor: Parser.HeaderExtractorInt16LE, data: [ 6, 0, 0, 0, 0, 5 ] },
		{ name: 'uint16 LE', extractor: Parser.HeaderExtractorUInt16LE, data: [ 6, 0, 0, 0, 0, 5 ] },

		{ name: 'int32 BE', extractor: Parser.HeaderExtractorInt32BE, data: [ 0, 0, 0, 8, 0, 0, 0, 5 ] },
		{ name: 'uint32 BE', extractor: Parser.HeaderExtractorUInt32BE, data: [ 0, 0, 0, 8, 0, 0, 0, 5 ] },
		{ name: 'int32 LE', extractor: Parser.HeaderExtractorInt32LE, data: [ 8, 0, 0, 0, 0, 0, 0, 5 ] },
		{ name: 'uint32 LE', extractor: Parser.HeaderExtractorUInt32LE, data: [ 8, 0, 0, 0, 0, 0, 0, 5 ] },
	]) {
		it('should work with header' + x.name, (done) => {
			const parser = new Parser(x.extractor);
			parser.on('message', message => {
				const value = message.readInt32BE(x.extractor.headerByteCount);
				expect(value).to.equal(5);
				// expect(0).to.equal(5);
				done();
			});

			parser.parseBytes(Buffer.from(x.data));
		});
	}
});
