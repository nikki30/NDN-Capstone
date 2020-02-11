const fs = require('fs');

const inputFn = process.argv[2];

const lines = fs.readFileSync(inputFn, 'utf8').split('\n').filter(_ => _).map(_ => _.trim());

const patternInit = /^(\d+(?:\.\d+)?) s:	Peer \/peer(\d+)-(\d+): ChronoSync Instance Initialized with (\d+) pending messages/;
const patternOut = /^(\d+(?:\.\d+)?) s:\tPeer \/peer(\d+)-(\d+): Delayed Interest with id: (\d+)$/;
const patternIn = /^(\d+(?:\.\d+)?) s:\tPeer \/peer(\d+)-(\d+): Data received from peer(\d+)-(\d+) : \[From node \/peer(\d+)-(\d+): (\d+)]; total messages received: (\d+)$/;

const hosts = {};
const allDelays = [];

const processInit = ([line, time, groupId, peerId, messagesToBeSent]) => {
    if (!hosts[groupId]) { hosts[groupId] = {}; }
    if (hosts[groupId][peerId]) { throw new TypeError('Peer ' + groupId + '-' + peerId + ' already exists.'); }
    hosts[groupId][peerId] = {
        messagesToBeSent: parseInt(messagesToBeSent),
        messagesOut: [],
        messagesIn: {},
        messagesInCount: 0,
        lastReceiptTime: 0
    };
};

const processOut = ([line, time, groupId, peerId, content]) => {
    if (!hosts[groupId] || !hosts[groupId][peerId]) { throw new TypeError('Peer ' + groupId + '-' + peerId + ' not exists.'); }
    hosts[groupId][peerId].messagesOut.push({
        content,
        time: parseFloat(time)
    });
};

const processIn = ([line, time, groupId, peerId, gatewayGroupId, gatewayPeerId, sourceGroupId, sourcePeerId, content, numOfReceived]) => {
    if (!hosts[groupId] || !hosts[groupId][peerId]) { throw new TypeError('Peer ' + groupId + '-' + peerId + ' not exists.'); }
    if ((++(hosts[groupId][peerId].messagesInCount)) !== parseInt(numOfReceived)) {
        throw new RangeError('Received count incorrect: ' + line);
    }
    if (!hosts[sourceGroupId] || !hosts[sourceGroupId][sourcePeerId]) {
        throw new TypeError('Source peer ' + groupId + '-' + peerId + ' not exists.');
    }
    if ((sourceGroupId === groupId) && (sourcePeerId === peerId)) {
        throw new RangeError('Message to peer itself: ' + line);
    }
    const messagesInList = hosts[groupId][peerId].messagesIn;
    if (!messagesInList[sourceGroupId]) { messagesInList[sourceGroupId] = {}; }
    if (!messagesInList[sourceGroupId][sourcePeerId]) { messagesInList[sourceGroupId][sourcePeerId] = []; }
    const targetList = messagesInList[sourceGroupId][sourcePeerId];
    const sentRecord = hosts[sourceGroupId][sourcePeerId].messagesOut.find(msg => msg.content === content);
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

for (let group in hosts) {
    for (let host in hosts[group]) {
        const hostObj = hosts[group][host];
        // post-verify 1: every node sent indicated num of messages?
        if (hostObj.messagesOut.length !== hostObj.messagesToBeSent) {
            throw new TypeError('Number of sent messages not matched: ' + group + '-' + host + ': declared ' + hostObj.messagesToBeSent + ', actual ' + hostObj.messagesOut.length);
        }
        // post-verify 2: every node received enough messages
        for (let sourceGroup in hosts) {
            for (let sourceHost in hosts[sourceGroup]) {
                if ((group === sourceGroup) && (host == sourceHost)) { continue; }
                if (!hostObj.messagesIn[sourceGroup] || !hostObj.messagesIn[sourceGroup][sourceHost]) { throw new TypeError('Peer ' + sourceGroup + '-' + sourceHost + ' was never received by ' + group + '-' + host); }
                const outLength = hosts[sourceGroup][sourceHost].messagesOut.length;
                const inLength = hostObj.messagesIn[sourceGroup][sourceHost].length;
                if (outLength !== inLength) {
                    throw new TypeError('Number of sent messages by ' + sourceGroup + '-' + sourceHost + ' (' + outLength + ') does not match that received by ' + group + '-' + host + ' (' + inLength + ')');
                }
            }
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