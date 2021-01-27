const gestaltSimilarity = require("gestalt-pattern-matcher").default;
// difflib is better
var difflib = require('difflib');

const firstString = "It is the same ˹to Him˺ whether any of you speaks secretly or openly, whether one hides in the darkness of night or goes about in broad daylight. ";
const secondString = "Alike (for Him) is he, from among you, who speaks quietly and he who speaks aloud, and he who hides in the night and he who walks out in the day. ";


console.time("Time this1");

var s = new difflib.SequenceMatcher(null,firstString , secondString);
console.log(s.ratio())
console.timeEnd("Time this1");

console.time("Time this");

console.log(gestaltSimilarity(firstString, secondString));

console.timeEnd("Time this");