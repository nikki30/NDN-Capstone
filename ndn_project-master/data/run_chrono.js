const fs = require('fs');

const inputFn = process.argv[2];

const lines = fs.readFileSync(inputFn, 'utf8').split('\n').filter(_ => _).map(_ => _.trim());

const patternInit = /^(\d+(?:\.\d+)?) s:	Peer \/peer(\d+): ChronoSync Instance Initialized with (\d+) pending messages/;
const patternOut = /^(\d+(?:\.\d+)?) s:\tPeer \/peer(\d+): Delayed Interest with id: (\d+)$/;
const patternIn = /^(\d+(?:\.\d+)?) s:\tPeer \/peer(\d+): Data received from peer(\d+) : \[From node \/peer(\d+): (\d+)]; total messages received: (\d+)$/;

const hosts = {};
const allDelays = [];

const processInit = ([line, time, peerId, messagesToBeSent]) => {
    if (!hosts[peerId]) { hosts[peerId] = {}; }
    // if (hosts[groupId][peerId]) { throw new TypeError('Peer ' + groupId + '-' + peerId + ' already exists.'); }
    hosts[peerId] = {
        messagesToBeSent: parseInt(messagesToBeSent),
        messagesOut: [],
        messagesIn: {},
        messagesInCount: 0,
        lastReceiptTime: 0
    };
};

const processOut = ([line, time, peerId, content]) => {
    if (!hosts[peerId]) 
    	{ throw new TypeError('Peer ' + '-' + peerId + ' not exists.'); }
    hosts[peerId].messagesOut.push({
        content,
        time: parseFloat(time)
    });
};

const processIn = ([line, time, peerId, gatewayPeerId, sourcePeerId, content, numOfReceived]) => {
    if (!hosts[peerId]) { throw new TypeError('Peer ' + '-' + peerId + ' not exists.'); }
    if ((++(hosts[peerId].messagesInCount)) !== parseInt(numOfReceived)) {
        throw new RangeError('Received count incorrect: ' + line);
    }
    if (!hosts[sourcePeerId]) {
        throw new TypeError('Source peer ' + '-' + peerId + ' not exists.');
    }
    if (sourcePeerId === peerId) {
        throw new RangeError('Message to peer itself: ' + line);
    }
    const messagesInList = hosts[peerId].messagesIn;
    // if (!messagesInList[sourcePeerId]) { messagesInList[sourcePeerId] = {}; }
    if (!messagesInList[sourcePeerId]) { messagesInList[sourcePeerId] = []; }
    const targetList = messagesInList[sourcePeerId];
    const sentRecord = hosts[sourcePeerId].messagesOut.find(msg => msg.content === content);
    if (!sentRecord) { throw new RangeError('Message never sent: ' + line); }
    if (targetList.findIndex(msg => msg.content === content) >= 0) { throw new RangeError('Duplicate message: ' + line); }
    targetList.push({
        content,
        delay: parseFloat(time) - sentRecord.time
    });
    allDelays.push({
        time: parseFloat(time),
        delay: parseFloat(time) - sentRecord.time
    });
};

lines.forEach(line => {
    const initMatched = line.match(patternInit);
    if (initMatched) { processInit(initMatched); return; }
    const outMatched = line.match(patternOut);
    if (outMatched) { processOut(outMatched); return; }
    const inMatched = line.match(patternIn);
    if (inMatched) { processIn(inMatched); return; }
    throw new RangeError('Cannot recognize line ' + line);
});

for (let host in hosts) {
    const hostObj = hosts[host];
    // post-verify 1: every node sent indicated num of messages?
    if (hostObj.messagesOut.length !== hostObj.messagesToBeSent) {
        // throw new TypeError('Number of sent messages not matched: '+ host + ': declared ' + hostObj.messagesToBeSent + ', actual ' + hostObj.messagesOut.length);
    }
    // post-verify 2: every node received enough messages
    for (let sourceHost in hosts) {
        if (host == sourceHost) { continue; }
        if ( !hostObj.messagesIn[sourceHost]) { 
        	// throw new TypeError('Peer '  + '-' + sourceHost + ' was never received by ' + '-' + host); 
        }
        const outLength = hosts[sourceHost].messagesOut.length;
        const inLength = hostObj.messagesIn[sourceHost].length;
        if (outLength !== inLength) {
            // throw new TypeError('Number of sent messages by ' + '-' + sourceHost + ' (' + outLength + ') does not match that received by ' + '-' + host + ' (' + inLength + ')');
        }
    }
}

console.log('Validity check passed.');

const outputPrefix = inputFn.split('.')[0];

fs.writeFileSync(outputPrefix + '.delay.json', JSON.stringify(allDelays));

fs.writeFileSync(outputPrefix + '.cdf.json', JSON.stringify(allDelays.map(_ => _.delay).sort((a, b) => a - b).map((delay, index) => {
    return { delay, percentile: (index + 1) / allDelays.length };
})));

console.log('Open browser with ?f=' + outputPrefix);