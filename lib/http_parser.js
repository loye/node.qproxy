var util = require('util');
var events = require("events");


/*
    HttpHeader
*/
function HttpHeader(type) {
    this.type = type;
    this.fields = {};
    this.lines = [];
    this.length = 0;
};


/*
    HttpPackage
*/
function HttpPackage(header) {
    this.header = header;
};


/*
    HttpParser
*/
function HttpParser() {
    events.EventEmitter.call(this);
};
util.inherits(HttpParser, events.EventEmitter);

(function (proto) {
    var KEYS = {
        REQUEST: ['method', 'url', 'version'],
        RESPONSE: ['version', 'code', 'status'],
        URL: ['schema', 'host', 'port', 'path', 'query']
    };

    proto.parseHeader = function (buffer, refresh) {
        (!refresh && this.context) || (this.context = { index: 0 });
        if (parseHeader.call(this.context, buffer, this)) {
            var header = this.context.header;
            this.context = undefined;
            return header;
        } else {
            return null;
        }
    };

    proto.parse = function (buffer, refresh) {
        (!refresh && this.context) || (this.context = { index: 0 });
        if (parse.call(this.context, buffer, this)) {
            var httpPackage = this.context.package;
            this.context = undefined;
            return httpPackage;
        } else {
            return null;
        }
    };

    function parseHeader(buffer, parser) {
        this.line || (this.line = { start: 0, end: 0, count: 0 });
        for (; this.index < buffer.length; this.index++) {
            switch (buffer[this.index]) {
                case 0x0D/*[\r]*/:
                    break;
                case 0x0A/*[\n]*/: //line end
                    if (buffer[this.index - 1] === 0x0D/*[\r]*/) {
                        this.line.end = this.index + 1;
                        if (this.line.end - this.line.start === 2) {
                            this.header.length = this.line.end;
                            if (this.header.type === 'request') {
                                this.header.host || (this.header.host = this.header.fields['Host'].split(':')[0]);
                                this.header.port || (this.header.port = +this.header.fields['Host'].split(':')[1]);
                            }
                            this.header.contentLength = this.header.fields['Content-Length'] > 0 ? +this.header.fields['Content-Length'] : 0;
                            this.header.chunked = this.header.fields['Transfer-Encoding'] === 'chunked';
                            return true; //header is completed
                        }

                        if (this.line.count === 0) {
                            parseStartline.call(this, buffer, this.line.start, this.line.end);
                        }
                        else {
                            parseLine.call(this, buffer, this.line.start, this.line.end);
                        }
                        this.header.lines[this.line.count] = buffer.toString('ascii', this.line.start, this.line.end);

                        if (this.line.count === 0) {
                            this.header.startline = this.header.lines[0];
                            //parser.emit('startline', this.header);
                        }

                        //initialize for next line
                        this.line.start = this.line.end;
                        this.line.count++;
                    }
                    break;
                default:
                    this.index++; //skip next
            }
        }
        return false; //header is incompeted
    };

    function parseStartline(buffer, start, end) {
        var isRequest = buffer[start] !== 0x48/*[H]*/;
        var keys = isRequest ? KEYS.REQUEST : KEYS.RESPONSE;
        this.header = new HttpHeader(isRequest ? 'request' : 'response');

        for (var i = v = start, k = 0; i < end && k < keys.length; i++) {
            switch (buffer[i]) {
                case 0x0D/*[\r]*/:
                case 0x20/*[ ]*/:
                    this.header[keys[k]] = buffer.toString('ascii', v, i);
                    if (isRequest && k === 1/*url*/) {
                        parseUrl.call(this, buffer, v, i);
                    }
                    k++;
                    v = i + 1;
                    break;
                default:
            }
        }

        if (!isRequest) {
            this.header.code = +this.header.code;
        }
    };

    function parseUrl(buffer, start, end) {
        var keys = KEYS.URL;
        for (var i = v = start, k = this.header.method === 'CONNECT' ? 1 : 0; i < end + 1 && k < keys.length; i++) {
            switch (k) {
                case 0: //schema
                    switch (buffer[i]) {
                        case 0x3A/*[:]*/:
                            this.header[keys[k]] = buffer.toString('ascii', v, i);
                            while (buffer[++i] === 0x2F/*[/]*/);
                            k++; //goto host
                            v = i;
                            break;
                        case 0x2F/*[/]*/:
                            k += 3; //goto path
                            break;
                        default:
                    }
                case 1: //host
                    switch (buffer[i]) {
                        case 0x3A/*[:]*/:
                            this.header[keys[k]] = buffer.toString('ascii', v, i);
                            k++; //goto port
                            v = i + 1;
                            break;
                        case 0x2F/*[/]*/:
                            this.header[keys[k]] = buffer.toString('ascii', v, i);
                            k += 2; //goto path
                            v = i;
                            break;
                        case 0x20/*[ ]*/:
                            this.header[keys[k]] = buffer.toString('ascii', v, i);
                            k = keys.length; //end
                            break;
                        default:
                    }
                    break;
                case 2: //port
                    switch (buffer[i]) {
                        case 0x2F/*[/]*/:
                            this.header[keys[k]] = buffer.toString('ascii', v, i);
                            k++; //goto path
                            v = i;
                            break;
                        case 0x20/*[ ]*/:
                            this.header[keys[k]] = buffer.toString('ascii', v, i);
                            k = keys.length; //end
                            break;
                        default:
                    }
                    break;
                case 3: //path
                    switch (buffer[i]) {
                        case 0x3F/*[?]*/:
                            this.header[keys[k]] = buffer.toString('ascii', v, i);
                            k++; //goto query
                            v = i + 1;
                            break;
                        case 0x23/*[#]*/:
                        case 0x20/*[ ]*/:
                            this.header[keys[k]] = buffer.toString('ascii', v, i);
                            k = keys.length; //end
                            break;
                        default:
                    }
                    break;
                case 4: //query
                    switch (buffer[i]) {
                        case 0x23/*[#]*/:
                        case 0x20/*[ ]*/:
                            this.header[keys[k]] = buffer.toString('ascii', v, i);
                            k = keys.length; //end
                            break;
                        default:
                    }
                    break;
                default:
            }
        }
        this.header.schema || (this.header.schema = '');
        this.header.port = this.header.port
            ? +this.header.port
            : (this.header.schema === 'http'
                ? 80
                : (this.header.schema === 'https'
                    ? 443
                    : 0));
    };

    function parseLine(buffer, start, end) {
        for (var i = k = v = start, key = null; i < end; i++) {
            switch (buffer[i]) {
                case 0x0D/*[\r]*/:
                    this.header.fields[key] = buffer.toString('ascii', v, i);
                    key = null;
                    break;
                case 0x0A/*[\n]*/:
                    k = i + 1;
                    break;
                case 0x3A/*[:]*/:
                    if (key === null) {
                        key = buffer.toString('ascii', k, i);
                        v = i + 1;
                    }
                    break;
                case 0x20/*[ ]*/:
                case 0x09/*[\t]*/:
                    if (v === i) {
                        v++;
                    }
                    break;
                default:
            }
        }
    };

    function parse(buffer, parser) {
        if (!this.header && parseHeader.call(this, buffer, parser)) {
            parser.emit('header', this.header);
        }
        if (this.header) {
            var header = this.header, valid = false;
            if (header.chunked) {
                var r = validateChunked(buffer, header.length, buffer.length);
                if (r && r.valid) {
                    valid = true;
                    header.contentLength = r.end - r.start;
                }
            } else {
                valid = buffer.length - header.length >= header.contentLength;
            }
            if (valid) {
                var httpPackage = new HttpPackage(header);
                httpPackage.content = new Buffer(header.contentLength);
                buffer.copy(httpPackage.content, 0, 0, header.contentLength);
                this.package = httpPackage;
            }
        }
        return valid;
    };

    function validateChunked(buffer, start, end) {
        for (var i = start, len = 0; i < end - 4;) {
            for (var tmp = buffer[i]; tmp != 0x0D/*[\r]*/ && i < end - 4; tmp = buffer[++i]) {
                len = (len << 4) + (tmp & 0x0F) + (tmp & 0x40 ? 9 : 0);
            }
            if (end >= i + 4 + len
                && buffer[i] == 0x0D/*[\r]*/
                && buffer[i + 1] == 0x0A/*[\n]*/
                && buffer[i + 2 + len] == 0x0D/*[\r]*/
                && buffer[i + 2 + len + 1] == 0x0A/*[\n]*/) {
                if (len == 0) {

                    return { valid: true, start: start, end: i + 4 };
                }
                i += 2 + len + 2;
                len = 0;
                continue;
            }
            break;
        }
        return { valid: false };
    };

})(HttpParser.prototype);


//exports
exports.HttpParser = HttpParser;
