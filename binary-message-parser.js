'use strict';
const EventEmitter   = require('events');
const stream = require('stream');

const ERR_INVALID_MSG_SIZE = new Error('invalid message size');

/**
 * @event message - event is emitted when all message bytes are received and is
 * provided with buffer object containing those bytes
 */
module.exports = class BinaryMessageParser extends stream.Writable { //EventEmitter {

	/**
	 * @param {Object} headerExtractor                      -
	 * @param {Number} headerExtractor.headerByteSize       - number of bytes
	 * that the meassage header consists of
	 * @param {Function} headerExtractor.extractMessageSize - method that takes
	 * Buffer object (with minimum size of headerByteSize) as parameter and
	 * returns number of bytes the entire message consists of
	 * @param {Function} headerExtractor.validateMessageSize - method that takes
	 * message size as parameter and returns whether it is valid or not,
	 * (optional) by default always returns true
	 * @param {Number} initialBufferSize                    - initial size of
	 * buffer used for storing bytes of unfinished messages, (optional) 10KB by
	 * default
	 */
	constructor (headerExtractor, initialBufferSize) {
		super();

		if (typeof headerExtractor !== 'object' ||
		    typeof headerExtractor.headerByteCount !== 'number' ||
		    typeof headerExtractor.extractMessageSize !== 'function')
			throw new TypeError('invalid header extractor');

		if (typeof headerExtractor.validateMessageSize !== 'function')
			headerExtractor.validateMessageSize = () => true;

		if (typeof initialBufferSize !== 'number')
			initialBufferSize = 10240;

		if (initialBufferSize <= 0)
			throw RangeError('initialBufferSize must be greater than 0');

		this.headerExtractor = headerExtractor;
		this.unfinishedMessageBuffer = Buffer.alloc(initialBufferSize);
		this.unfinishedMessageSize = 0;
		this.expectedMessageSize = 0;
		this.bMessageHeaderExtracted = false;
		this.bShutdown = false;
		this.lastError = null;
	}

	/**
	 * returns whether parser is shut down due to an error
	 *
	 * @return true if parser is shutdown
	 */
	isShutdown () {
		return this.bShutdown;
	}

	/**
	 * @return true if parser is not waiting for bytes of unfinished message
	 */
	isFinished () {
		return (this.unfinishedMessageSize == 0);
	}

	/**
	 * @param {Object} bytes    -
	 * @param {String} encoding - , required only if bytes parameter is not
	 * instance of Buffer class
	 * @return {Boolean} true if bytes were successfully parsed, false otherwise
	 */
	parseBytes (bytes, encoding) {
		if (this.isShutdown())
			return false;

		if (bytes instanceof Buffer !== true)
			bytes = Buffer.from(bytes, encoding);

		let offset = 0;

		while (offset < bytes.length) {
			 const bytesParsed = this.isFinished() ?
				this._startNewMessage(bytes, offset) :
				this._continueUnfinishedMessage(bytes, offset);

			if (bytesParsed < 0) {
				this.bShutdown = true;
				return false;
			}

			offset += bytesParsed;
		}

		return true;
	}

	_write (chunk, encoding, done) {
		let err = null;

		if (chunk instanceof Buffer != true)
			chunk = Buffer.from(chunk, encoding);

		if (this.parseBytes(chunk) !== true)
			done(this.lastError || new Error('unknown error'));

		done();
	}

	_startNewMessage (dataBuffer, offset) {
		const availableBytesCount = dataBuffer.length - offset;

		if (availableBytesCount < this.headerExtractor.headerByteCount) {
			// missing message header bytes
			this._appendToUnfinishedMessage(dataBuffer, offset, availableBytesCount);

			this.expectedMessageSize = this.headerExtractor.headerByteCount;
			this.bMessageHeaderExtracted = false;

			return availableBytesCount;
		}

		const messageSize = this._extractMessageSize(dataBuffer, offset);

		if (this.headerExtractor.validateMessageSize(messageSize) !== true) {
			const self = this;
			setImmediate(() => {
				self._error(ERR_INVALID_MSG_SIZE, { size: messageSize });
			});
			return -1;
		}

		if (availableBytesCount >= messageSize) {
			// got all message bytes
			this._notifyMessageReceived(dataBuffer, offset, messageSize);
			return messageSize;
		}

		this._appendToUnfinishedMessage(dataBuffer, offset, availableBytesCount);

		this.expectedMessageSize = messageSize;
		this.bMessageHeaderExtracted = true;

		return availableBytesCount;
	}

	_continueUnfinishedMessage (dataBuffer, offset) {
		const missingBytesCount = this.expectedMessageSize - this.unfinishedMessageSize;

		const availableBytesCount = dataBuffer.length - offset;

		if (availableBytesCount < missingBytesCount) {
			// still missing some bytes
			this._appendToUnfinishedMessage(dataBuffer, offset, availableBytesCount);
			return availableBytesCount;
		}

		this._appendToUnfinishedMessage(dataBuffer, offset, missingBytesCount);

		if (this.bMessageHeaderExtracted) {
			// got all message bytes
			this._notifyMessageReceived(this.unfinishedMessageBuffer, 0, this.expectedMessageSize);
		} else {
			// got all message header bytes
			this.expectedMessageSize = this._extractMessageSize(this.unfinishedMessageBuffer, 0);
			this.bMessageHeaderExtracted = true;

			if (this.headerExtractor.validateMessageSize(this.expectedMessageSize) !== true) {

				const self = this;
				setImmediate(() => {
					self._error(ERR_INVALID_MSG_SIZE, { size: this.expectedMessageSize });
				});
				return -1;
			}
		}

		return missingBytesCount;
	}

	_appendToUnfinishedMessage (dataBuffer, offset, count) {

		const availableSpace = this.unfinishedMessageBuffer.length - this.unfinishedMessageSize;

		if (availableSpace < count) {
			const significantUnfinBuffer = this.unfinishedMessageBuffer.slice(0, this.unfinishedMessageSize);
			const bufferToAppend = dataBuffer.slice(offset, offset + count);

			// resize unfinished message buffer
			this.unfinishedMessageBuffer = Buffer.concat([significantUnfinBuffer, bufferToAppend]);
			this.unfinishedMessageSize += count;
			return;
		}

		dataBuffer.copy(this.unfinishedMessageBuffer, this.unfinishedMessageSize, offset, offset + count);

		this.unfinishedMessageSize += count;
	}

	_notifyMessageReceived (dataBuffer, offset, size) {
		this._reset();

		const message = Buffer.alloc(size);
		dataBuffer.copy(message, 0, offset, offset + size);

		const self = this;

		setImmediate(() => {
			self.emit('message', message);
		})

	}

	_reset () {
		this.bMessageHeaderExtracted = false;
		this.expectedMessageSize = 0;
		this.unfinishedMessageSize = 0;
	}

	_extractMessageSize (dataBuffer, offset) {
		const idxEnd = offset + this.headerExtractor.headerByteCount;
		const slice = dataBuffer.slice(offset, idxEnd);
		return this.headerExtractor.extractMessageSize(slice);
	}

	_error (err, args) {
		this.lastError = err;
		this.emit('error', ERR_INVALID_MSG_SIZE, args);
	}
};

const createPODExtractor = (headerByteCount, methodName) => {
	return {
		headerByteCount     : headerByteCount,
		extractMessageSize  : buffer => { return buffer[methodName](0); },
		validateMessageSize : size => { return size >= headerByteCount; },
	};
};

module.exports.HeaderExtractorInt8     = createPODExtractor(1, 'readInt8');
module.exports.HeaderExtractorUInt8    = createPODExtractor(1, 'readUInt8');
module.exports.HeaderExtractorInt16LE  = createPODExtractor(2, 'readInt16LE');
module.exports.HeaderExtractorUInt16LE = createPODExtractor(2, 'readUInt16LE');
module.exports.HeaderExtractorInt16BE  = createPODExtractor(2, 'readInt16BE');
module.exports.HeaderExtractorUInt16BE = createPODExtractor(2, 'readUInt16BE');
module.exports.HeaderExtractorInt32LE  = createPODExtractor(4, 'readInt32LE');
module.exports.HeaderExtractorUInt32LE = createPODExtractor(4, 'readUInt32LE');
module.exports.HeaderExtractorInt32BE  = createPODExtractor(4, 'readInt32BE');
module.exports.HeaderExtractorUInt32BE = createPODExtractor(4, 'readUInt32BE');
