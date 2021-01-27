// Maximum verse number
var MAX_VERSE = 286


// Store the translation to be used for verse detection logically when no ML model is available
var translation;

// Loading universal sentence encoder model
var model2 = use.load();

// Creating line to [chapter,verseNo] mappings
// Array containing number of verses in each chapters
var chaplength = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6]
// contains chapter verse mappings for each line
var mappings = []

for (i = 1; i <= 114; i++) {
  for (j = 1; j <= chaplength[i - 1]; j++) {
    mappings.push([i, j])
  }
}

// numberpattern that match numbers less than 300 and with negative lookbehind and negative lookahead digits
//  i.e no digit front and end of match
var numberPattern = new RegExp(/(?<!\d)[0-2]?\d{1,2}(?!\d)/gi)
// stores LunrIndex Object, which will be used to perform search
var lunrIndex
// Stores result of numberPattern in htmlstring
var numbers
var optimizedTrans
var avgarr = []
var cleanTransArr
async function begin(){
translation = await getTranslation("https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/eng-ummmuhammad.min.json")
optimizedTrans = getOptimizedArr(translation)
avgarr = getAvergeVerseLenArr(optimizedTrans)
console.log(avgarr)
cleanTransArr = cleanTrans(optimizedTrans)
lunrIndex = getLunrIndex(cleanTransArr)


 // convert html to string
 str = $.parseHTML(str).reduce((full, val) => full+" "+val.textContent)

 // removing css,html,links,ISBN,17+ character length,multiple spaces from str to narrow down the search
 str = str.replace(/<([A-Z][A-Z0-9]*)\b[^>]*>(.*?)<\/\1>/gi," ").replace(/<([A-Z][A-Z0-9]*)>.*?<\/\1>/gi," ").replace(/<([A-Z][A-Z0-9]*)\b[^>]*\/?>(.*?)/gi," ").replace(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi," ").replace(/(?<=\s)[^ ]*\s*\{[^\}]+\:[^\}]+\}/gi," ").replace(/[^\s]{17,}/gi," ").replace(/\d{4,}/gi," ").replace(/\s\s+/g, " ")

 // Contains pattern, chapterNo, fromVerse, toVerse
 var confirmedChPattern = []

// Take on numbers between 1 to 286 as these only could be valid verses
  numbers = Array.from(str.matchAll(numberPattern)).filter(e=>e[0]>0&&e[0]<=286)
console.log("numbers length:"+numbers.length)

// I could use ignorePatterns to more narrow down the search, I could also include date, time etc to remove
var ignorePatterns = ignoreBiblePattern.concat(ignoreQuranPattern)
// Patterns that confirms the verse pattern
var goodPatterns = confirmPattern.concat(arabicQuranName.map(e=>e[0]), englishQuranName.map(e=>e[0]))
//

outerLoop:
for(var i=0;i<numbers.length;i++){
  if(numbers[i]){
 for(var patt of goodPatterns){
  if(new RegExp(patt).test(str.substring(numbers[i].index-15, numbers[i].index + 15)) || numberPattern.test(str.substring(numbers[i].index+numbers[i][0].length, numbers[i].index+numbers[i][0].length+5 ))){
       console.log("string is,"+str.substring(numbers[i].index-20, numbers[i].index + 20))
     // Remove the next numbers if they are within 10 characters of this confirmed pattern
       // we don't want to waste time
       for(var j=i+1;j<i+10;j++)
           {if(numbers[j]&&numbers[j].index-10<numbers[i].index)numbers[j]=undefined;}
        continue outerLoop
      }
}
// Remove the matches which did not pass above regex
numbers[i]=undefined
}
}
// Remove the undefined values, which we got from above step
numbers = numbers.filter(Boolean)
console.log("numbers length:"+numbers.length)
// Print high quality matches
console.log(numbers)
var confirmed = []

for(var number of numbers){

  verselen = getVerseLength(str.substring(number.index-15, number.index + 15))
//  console.log("verse length is ",verselen)
//  lunrIndex.search(str.substring(number.index-verselen-10, number.index).replace(/[^a-z']/gi," ").replace(/\s\s+/gi, " "))


}
console.log("hi ")
// String should be clean from unknown chars like ‘ etc when searching with lunrjs
//for(var val of cleanTransArr.slice(500,1200))
//lunrIndex.search(val.replace(/[^a-z']/gi," ").replace(/\s\s+/gi, " "))
//console.log(avgarr)

testLunr()

}

async function getTranslation(url){
return await fetch(url).then(response => response.json())

}

function cleanTrans(translationArr){
return translationArr.flat().map(e=> e.replace(/[^a-z']/gi," ").replace(/\s\s+/gi, " "))
}

// Takes a string containing numbers and tells the verse length of those numbers
function getVerseLength(strval){

var values = strval.match(numberPattern)

if(values.length>1 && optimizedTrans[values[0]-1] && optimizedTrans[values[0]-1][values[1]-1]){
//  console.log("chosen chapter  ",values[0], " and verse ",values[1])
return optimizedTrans[values[0]-1][values[1]-1].length

}else if(values.length == 1 && avgarr[values[0]-1]){
//  console.log("chosen verse  ",values[0])
return avgarr[values[0]-1]
}

}

// Returns an array having average langth value for each verse no 1 to 286
function getAvergeVerseLenArr(translationArr){
for(var i=0;i<MAX_VERSE;i++){
  // Get array containing length of ith verse for each chapter, and filter all undefined values
arr = translationArr.map(e=>e[i]?e[i].length:undefined).filter( Boolean )
// Calculate the average length of ith verse for each chapter and then round it
avgarr[i] = Math.round(arr.reduce((full,val)=>full+val)/arr.length)
}
return avgarr
}

// Converts the translation into arr[chapter-1][verse-1] array form for easier operations
function getOptimizedArr(translationObj){
var holderarr = []
for(var val of translationObj.quran){
  if(!holderarr[val.chapter-1])
holderarr[val.chapter-1] = []
holderarr[val.chapter-1][val.verse-1] = val.text

}
return holderarr
}
begin()

// https://lunrjs.com/guides/getting_started.html#creating-an-index
// Returns LunrIndex Object
function getLunrIndex(translationclean){


 // This will contain array with objects having id and text, where id is chapter,verse and text is verse
  var transDocs = translationclean.map((e,i)=>{
    var obj = {};
    obj['id']= mappings[i].toString()
    obj['text']=e.replace(/[^a-z']/gi," ").replace(/\s\s+/gi, " ")
    return obj
})



  var idx = lunr(function () {
    this.ref('id')
    this.field('text')

    transDocs.forEach(function (doc) {
      this.add(doc)
    }, this)
  })

return idx

}

var harr = []
function testLunr(){

for(var val of cleanTransArr){
  var idx = lunr(function() {
        this.field('body')

    this.add({
      "body": val,
      "id": "1"
    })
  })
harr.push({...idx})
}

console.log("hi")
var start = performance.now();
for(var i=0;i<cleanTransArr;i++){

harr[i].search(cleanTransArr[i])

}
var end = window.performance.now();
console.log(`Execution time: ${end - start} ms`);
console.log("bye")

}


// Returns the verses in an array,
// if fromChap is undefined, then it starts from chapter 1
// if fromVerse is undefined, then it starts from verse 1
// if toChap is undefined, then it retrives the whole quran, starting from fromChap & fromVerse
// if toVerse is undefined, then it retrives the whole chapter till end , starting from fromChap & fromVerse
function getVersesArr(translationArr,fromChap, fromVerse, toChap, toVerse) {

    // Set the chapter to 1 if fromChap is undefined
    fromChap=fromChap?fromChap:1
  // Set the verse to 1 if fromVerse is undefined
     fromVerse=fromVerse?fromVerse:1
  // Set to last chapter if toChap is undefined
    toChap=toChap?toChap:114
  // Set to last verse if toVerse is undefined
     toVerse= toVerse?toVerse:chaplength[toChap-1]

// lastindex stores negative value, when passed to slice, it means to remove last n values
var lastindex = toVerse-chaplength[toChap-1]
if(lastindex==0)
   lastindex = undefined

return translationArr.slice(fromChap-1,toChap).flat().slice(fromVerse-1,lastindex)
     // stores the lines to be written
//    return  transArr.slice(from, to+1)



}

// Tensorflow check code
var start,end;


console.log("Loading the model");
tf.env().set("WEBGL_DELETE_TEXTURE_THRESHOLD", 0);
var model1 = use.load();
async function run() {
  var usemodel = await model1;
  console.log("Fetching the data");
  var json = await fetch(
    "https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/eng-ummmuhammad.min.json"
  ).then((response) => response.json());
  var arr = json.quran.map((e) => e.text).slice(0, 250);
  // Embedding the text into numbers, so that model can understand
  console.log("Embeding the data using USE Model");
  var embed;
  start = performance.now()
  while (arr.length > 0) {
    var embed = await usemodel.embed(arr.splice(0, 50));
    console.log("embeeded")
    // embed.dispose();
  }
   end = window.performance.now();
  console.log(`Execution time: ${end - start} ms`);
}
// Calling run function
run();




// Have to use multiple english translations to get all the results
// Refer https://en.wikipedia.org/wiki/Biblical_canon  to add more names
// https://en.wikipedia.org/wiki/New_Testament
var ignoreBiblePattern = [
  /genesis/gi,
  /exodus/gi,
  /leviticus/gi,
  /deuteronomy/gi,
  /joshua/gi,
  /ruth/gi,
  /samuel/gi,
  /chronicl/gi,
  /nehemiah/gi,
  /esther/gi,
  /psalm/gi,
  /proverb/gi,
  /Ecclesiastes/gi,
  /song/gi,
  /Canticles/gi,
  /Isaiah/gi,
  /Jeremiah/gi,
  /Lamentations/gi,
  /Ezekiel/gi,
  /Daniel/gi,
  /Hosea/gi,
  /Joel/gi,
  /Amos/gi,
  /Obadiah/gi,
  /Micah/gi,
  /Nahum/gi,
  /Habakkuk/gi,
  /Zephaniah/gi,
  /Haggai/gi,
  /Zechariah/gi,
  /Malachi/gi,
  /Matthew/gi,
  /Mark/gi,
  /Luke/gi,
  /Romans/gi,
  /Corinthians/gi,
  /Epistle/gi,
  /Paul/gi,
  /Galatians/gi,
  /Ephesians/gi,
  /Philippians/gi,
  /Colossians/gi,
  /Thessalonians/gi,
  /Timothy/gi,
  /Titus/gi,
  /Philemon/gi,
  /Hebrews/gi,
  /James/gi,
  /Peter/gi,
  /Jude/gi
]












// Re read the comments and remove unwanted and implement the ideas

// Use conventions for variable names and function names, search google

// Add more translations to make sure not to miss any verse, (very important, try adding all english translations to avoid missing any verse)

// This will contain visible parsed html text, we will do it page wise to make it easier to count relevance,remove multiple whitespaces/tabs etc from text to make things easier, code is there in qacode.txt


// start unit testing


var ignoreQuranPattern = [/course/gi, /recit/gi, /listen/gi, /hear/gi, /read/gi, /learn/gi, /study/gi, /understand/gi]




// Matches quran, surah, ayah, names of surah etc
var confirmPattern = [
  /\s(q(u|o)r.{1,4}n|k(o|u)r.{1,4}n)/gi,
  /\ss(ū|u|o){1,2}ra/gi,
  /\s(a|ā)y(a|ā)/gi,
  /\sverse/gi,
  /\schapter/gi,
  /\s[0-9]{1,3}\s{0,5}:\s{0,5}[0-9]{1,3}\s{0,5}(-|to|and)\s{0,5}[0-9]{1,3}/gi,
  /\s[0-9]{1,3}\s{0,5}:\s{0,5}[0-9]{1,3}/gi
]
// Pattern for names of surah and their chapter numbers
// keep tigher pattern up, test it using https://en.wikipedia.org/wiki/List_of_chapters_in_the_Quran
// might have to keep arabic names in other var
// check there shouldn't be mistakes in surah number
/*
Alphabets with Diacritic
(a|ā)
(d|Ḏ)
(h|ḥ)
(ī|i|e)
(ū|u|o)
(s|Š)
(t|Ṭ)
(q|q̈)

*/
var arabicQuranName = [
  [/f(a|ā){1,2}(t|Ṭ)i(h|ḥ)(a|ā)/gi, 1],
  [/b(a|ā){1,2}(q|q̈)(a|ā){1,2}r(a|ā)/gi, 2],
  [/(ī|i|e)mr(a|ā){1,2}n/gi, 3],
  [/n(ī|i|e)s(a|ā)/gi, 4],
  [/m(a|ā){1,2}.?(ī|i|e)(d|Ḏ)(a|ā)/gi, 5],
  [/(a|ā)n.?(a|ā){1,2}m/gi, 6],
  [/(a|ā){1,2}.?r(a|ā){1,2}f/gi, 7],
  [/(a|ā)nf(a|ā){1,2}l/gi, 8],
  [/(t|Ṭ)(a|ā){1,2}wb(a|ā){1,2}/gi, 9],
  [/b(a|ā)r(a|ā){1,2}.?(a|ā){0,2}/gi, 9],
  [/y(ū|u|o){1,2}n(ū|u|o){1,2}s/gi, 10],
  [/h(ū|u|o){1,2}(d|Ḏ)/gi, 11],
  [/y(ū|u|o){1,2}(s|Š)(ū|u|o){1,2}f/gi, 12],
  [/r(a|ā){1,2}(d|Ḏ)/gi, 13],
  [/(i|e|a|ī|ā){1,2}br(a|ā){1,2}(h|ḥ)(a|i|ī|e){1,2}m/gi, 14],
  [/(Ḥ|h)(ī|i|e)jr/gi, 15],
  [/n(a|ā){1,2}(Ḥ|h)l/gi, 16],
  [/(ī|i|e)sr(a|ā)/gi, 17],
  [/k(a|ā){1,2}(h|ḥ)f/gi, 18],
  [/m(a|ā){1,2}ry/gi, 19],
  [/(t|Ṭ)(a|ā){1,2}.{0,3}(h|ḥ)(a|ā){1,2}/gi, 20],
  [/(a|ā)nb(ī|i|e)y/gi, 21],
  [/(h|Ḥ)(a|ā){1,2}j/gi, 22],
  [/m(ū|u|o){1,2}.?m(ī|i|e){1,2}n(ū|u|o){1,2}n/gi, 23],
  [/n(u{1}|o{2})r/gi, 24],
  [/f(ū|u|o){1,2}r(q|q̈)(a|ā){1,2}n/gi, 25],
  [/(s|Š)h?(ū|u|o){1,2}.?(a|ā){1,2}r(a|ā){1,2}/gi, 26],
  [/n(a|ā){1,2}ml/gi, 27],
  [/(q|Q̈)(a|ā){1,2}(s|ṣ)(a|ā){1,2}(s|ṣ)/gi, 28],
  [/(a|ā)nk(a|ā)b.{1,3}t/gi, 29],
  [/ru{1}m/gi, 30],
  [/l(ū|u|o)(q|q̈)m(a|ā){1,3}n/gi, 31],
  [/(s|Š)(a|ā)j(d|Ḏ)(a|ā)/gi, 32],
  [/(a|ā)(ḥ|h)z(a|ā){1,2}b/gi, 33],
  [/(s|Š)(a|ā){1,2}b(a|ā)/gi, 34],
  [/f(a|ā){1,2}(t|ṭ)(ī|i|e){1,2}r/gi, 35],
  [/m(a|ā)l(a|ā){1,2}.?(ī|i|e){1,2}k(a|ā)/gi, 35],
  [/y(a|ā){1,2}.?(s|Š)(ī|i|e){1,2}n/gi, 36],
  [/(s|Ṣ)(a|ā){1,3}f{1,2}(a|ā){1,3}t/gi, 37],
  [/(s|Ṣ)(a|ā){1,2}(d|Ḏ)/gi, 38],
  [/z(ū|u|o)m(a|ā){1,3}r/gi, 39],
  [/g(h|ḥ)?(ā|a){1,2}f(ī|i|e){1,2}r/gi, 40],
  [/f(ū|u|o){1,2}(s|ṣ){1,2}(ī|i|e){1,2}l(a|ā){1,2}(t|Ṭ)/gi, 41],
  [/(Ḥ|h)(ā|a).{1,3}.?m(ī|i|e){1,2}m (s|Š)(a|ā)j(d|Ḏ)(a|ā)/gi, 41],
  [/(s|Š)(h|ḥ)(ū|u|o){1,3}r(a|ā){1,3}/gi, 42],
  [/z(ū|u|o)k(h|ḥ)?r(ū|u|o){1,3}f/gi, 43],
  [/(d|Ḏ)(ū|u|o){1,2}k(h|ḥ)?(a|ā){1,2}n/gi, 44],
  [/j(a|ā){1,2}(t|Ṭ)(h|ḥ)?(ī|i|e)y(a|ā)h/gi, 45],
  [/j(a|ā){1,2}(s|Š)(ī|i|e)y(a|ā)h/gi, 45],
  [/(a|ā)(ḥ|h)(q̈|q)(a|ā){1,2}f/gi, 46],
  [/m(ū|u|o){1,2}(ḥ|h)(a|ā)mm(a|ā)(d|Ḏ)/gi, 47],
  [/f(a|ā)(t|Ṭ)(h|ḥ)/gi, 48],
  [/(h|ḥ)(u|o)j(u|o)r(a|ā){1,2}t/gi, 49],
  [/(Q̈|q)(a|ā){1,2}f/gi, 50],
  [/(d|Ḏ)h?(a|ā){1,2}r(ī|i|e)y(a|ā){1,2}t/gi, 51],
  [/(Ṭ|t)(o|ū|u){1,2}r/gi, 52],
  [/n(a|ā)jm/gi, 53],
  [/(q|Q̈)(a|ā)m(a|ā)r/gi, 54],
  [/ra(ḥ|h)m(a|ā){1,2}n/gi, 55],
  [/w(a|ā){1,2}(q|q̈)(ī|i|e).?(a|ā)/gi, 56],
  [/(h|Ḥ)(a|ā)(d|Ḏ)(ī|i|e){1,2}(d|Ḏ)/gi, 57],
  [/m(ū|u|o){1,2}j(ā|a){1,2}(d|Ḏ)(ī|i|e){1,2}l(ā|a)/gi, 58],
  [/(h|Ḥ)(ā|a){1,2}(š|s)h?r/gi, 59],
  [/m(ū|u|o)m(t|Ṭ)(ā|a){1,2}(h|Ḥ)(i|a|e){1,2}n(ā|a)/gi, 60],
  [/(ī|i|e)m(t|Ṭ)(ī|i|e)(h|ḥ)(a|ā){1,2}n/gi, 60],
  [/m(a|ā)w(a|ā)(d|Ḏ){1,2}(a|ā)/gi, 60],
  [/Ṣ(ā|a){1,2}f/gi, 61],
  [/j(ū|u|o)m(ū|u|o)?.?(a|ā){1,2}/gi, 62],
  [/m(ū|u|o){1,2}n(ā|a){1,2}f(ī|i|e){1,2}(q̈|q)(o|ū|u){1,2}n/gi, 63],
  [/(t|Ṭ)(ā|a)g(h|ḥ)?(ā|a){1,2}b(o|ū|u)n/gi, 64],
  [/(t|Ṭ)al(ā|a){1,2}(q|q̈)/gi, 65],
  [/(t|Ṭ)(a|ā)(h|ḥ)r(e|ī|i){1,2}m/gi, 66],
  [/(Q̈|q)(a|ā)l(a|ā){1,2}m/gi, 68],
  [/(Ḥ|h)(ā|a){1,2}(Q̈|q){1,2}(ā|a)/gi, 69],
  [/m(ā|a){1,2}.(ā|a){1,2}r(ī|i|e)j/gi, 70],
  [/n(o|ū|u){1,2}(a|ā)?(ḥ|h)/gi, 71],
  [/j(ī|i|e)n/gi, 72],
  [/m(ū|u|o)zz?(a|ā)mm?(ī|i|e)l/gi, 73],
  [/m(ū|u|o)(d|Ḏ){1,2}(a|ā)(t|Ṭ)?(h|ḥ)?(t|Ṭ)?(h|ḥ)?(ī|i|e)r/gi, 74],
  [/(q|Q̈)(ī|i|e)y(a|ā)m(a|ā)/gi, 75],
  [/(ī|i|e)n(s|Š)(a|ā){1,2}n/gi, 76],
  [/m(o|ū|u){1,2}r(s|Š)(ā|a){1,2}l(ā|a){1,2}(t|Ṭ)/gi, 77],
  [/n(a|ā)b(a|ā){1,2}/gi, 78],
  [/n(a|ā){1,2}z(ī|i|e).?(a|ā){1,2}(t|Ṭ)/gi, 79],
  [/(a|ā)b(a|ā){1,2}(s|Š)(a|ā){1,2}/gi, 80],
  [/(t|Ṭ)(a|ā)kw(i|e|ī){1,2}r/gi, 81],
  [/(i|e|ī)nf(i|e|ī)(ṭ|t)(a|ā){1,2}r/gi, 82],
  [/m(o|ū|u){1,2}(ṭ|t)(a|ā){1,2}ff?(ī|i|e){1,2}ff?(ī|i|e){1,2}n/gi, 83],
  [/(i|e|ī)n(š|s)h?(i|e|ī)(q̈|q)(a|ā){1,2}(q̈|q)/gi, 84],
  [/b(ū|o|u).?r(ū|o|u){1,2}j/gi, 85],
  [/(Ṭ|t)(a|ā){1,2}r(ī|i|e){1,2}(q̈|q)/gi, 86],
  [/(a|ā){1,2}l(a|ā){1,2}/gi, 87],
  [/g(h|ḥ)?(a|ā){1,2}(s|š){1,2}(h|ḥ)?(i|e|ī)y(a|ā)/gi, 88],
  [/f(a|ā){1,2}j(a|ā)?r/gi, 89],
  [/b(a|ā){1,2}l(a|ā){1,2}(d|Ḏ)/gi, 90],
  [/(s|š)(h|ḥ)?(a|ā)m(s|š)/gi, 91],
  [/l(a|ā)yl/gi, 92],
  [/(Ḍ|d)(h|ḥ)?(ū|u|o)(ḥ|h)(a|ā)/gi, 93],
  [/(s|š)h?(a|ā)r(ḥ|h)/gi, 94],
  [/(ī|i|e)n(s|š)h?(ī|i|e)r(a|ā){1,2}/gi, 94],
  [/(t|Ṭ)(ī|i|e){1,2}n/gi, 95],
  [/(a|ā){1,2}l(a|ā){1,2}(q|q̈)/gi, 96],
  [/(Q̈|q)(a|ā){1,2}(d|Ḏ)(a|ā){0,2}r/gi, 97],
  [/b(a|ā)yy?(ī|i|e)n(a|ā){1,2}/gi, 98],
  [/z(a|ā){1,2}lz(a|ā){1,2}l(a|ā){1,2}/gi, 99],
  [/(a|ā){1,2}(d|Ḏ)(ī|i|e)y(a|ā){1,2}/gi, 100],
  [/(Q̈|q)(a|ā){1,2}r(ī|i|e){1,2}.?(a|ā)/gi, 101],
  [/(t|Ṭ)(a|ā)k(a|ā){1,2}(t|Ṭ)(h|ḥ)?(ū|u|o)r/gi, 102],
  [/(t|Ṭ)(a|ā)k(a|ā){1,2}(s|Š)(ū|u|o){1,2}r/gi, 102],
  [/(a|ā){1,2}(s|š)r/gi, 103],
  [/(Ḥ|h)(ū|u|o){1,2}m(a|ā){1,2}z(a|ā){1,2}/gi, 104],
  [/f(i|e{2})l/gi, 105],
  [/(q|q̈)(ū|u|o){1,2}r(a|ā){1,2}(i|y)(s|š)(h|ḥ)?/gi, 106],
  [/m(a|ā){1,2}.?(ū|o|u){1,2}n/gi, 107],
  [/k(a|ā){1,2}(u|w)(Ṭh|tḥ|Ṭḥ|th|s|Š)(a|ā){1,2}r/gi, 108],
  [/k(a|ā){1,2}f(ī|i|e){1,2}r(ū|o|u){1,2}n/gi, 109],
  [/n(a|ā){1,2}(s|š)r/gi, 110],
  [/m(a|ā){1,2}(s|š)(a|ā){1,2}(d|Ḏ)/gi, 111],
  [/(ī|i|e)k(h|ḥ)l(a|ā){1,2}(s|š)/gi, 112],
  [/(t|Ṭ)(a|ā)w(ḥ|h)(ī|i|e){1,2}(d|Ḏ)/gi, 112],
  [/f(a|ā){1,2}l(a|ā){1,2}q̈/gi, 113],
  [/n(a|ā){1,2}(s|š)/gi, 114]

]




var englishQuranName = [
  [/open/gi, 1],
  [/key/gi, 1],
  [/Seven Oft/gi, 1],
  [/calf/gi, 2],
  [/heifer/gi, 2],
  [/cow/gi, 2],
  [/women/gi, 4],
  [/food/gi, 5],
  [/table/gi, 5],
  [/feast/gi, 5],
  [/cattle/gi, 6],
  [/livestock/gi, 6],
  [/height/gi, 7],
  [/elevation/gi, 7],
  [/purgatory/gi, 7],
  [/discernment/gi, 7],
  [/spoil.{1,7}war/gi, 8],
  [/repent/gi, 9],
  [/repudiation/gi, 9],
  [/jona.{0,2}h/gi, 10],
  [/josep/gi, 12],
  [/josef/gi, 12],
  [/thunder/gi, 13],
  [/tract/gi, 15],
  [/stone/gi, 15],
  [/rock/gi, 15],
  [/bee/gi, 16],
  [/journey/gi, 17],
  [/cave/gi, 18],
  [/prophet/gi, 21],
  [/pilgrimage/gi, 22],
  [/believer/gi, 23],
  [/light/gi, 24],
  [/criteri/gi, 25],
  [/standard/gi, 25],
  [/poet/gi, 26],
  [/ant/gi, 27],
  [/narration/gi, 28],
  [/stor(ies|y)/gi, 28],
  [/spider/gi, 29],
  [/roman/gi, 30],
  [/byzanti/gi, 30],
  [/prostration/gi, 32],
  [/adoration/gi, 32],
  [/worship/gi, 32],
  [/clan/gi, 33],
  [/confederat/gi, 33],
  [/force/gi, 33],
  [/Coal(a|i)tion/gi, 33],
  [/sheba/gi, 34],
  [/originat/gi, 35],
  [/initiator/gi, 35],
  [/creator/gi, 35],
  [/angel/gi, 35],
  [/crowd/gi, 39],
  [/troop/gi, 39],
  [/throng/gi, 39],
  [/forgiv/gi, 40],
  [/detail/gi, 41],
  [/distinguish/gi, 41],
  [/spell/gi, 41],
  [/consult/gi, 42],
  [/council/gi, 42],
  [/counsel/gi, 42],
  [/gold/gi, 43],
  [/luxury/gi, 43],
  [/smoke/gi, 44],
  [/kneel/gi, 45],
  [/crouching/gi, 45],
  [/Hobbling/gi, 45],
  [/sand/gi, 46],
  [/dunes/gi, 46],
  [/victory/gi, 48],
  [/conquest/gi, 48],
  [/triumph/gi, 48],
  [/apartment/gi, 49],
  [/chambers/gi, 49],
  [/room/gi, 49],
  [/wind/gi, 51],
  [/Scatter/gi, 51],
  [/mount/gi, 52],
  [/the star/gi, 53],
  [/the unfold/gi, 53],
  [/moon/gi, 54],
  [/merciful/gi, 55],
  [/gracious/gi, 55],
  [/inevitable/gi, 56],
  [/event/gi, 56],
  [/iron/gi, 57],
  [/plead/gi, 58],
  [/Dialogue/gi, 58],
  [/disput/gi, 58],
  [/muster/gi, 59],
  [/exile/gi, 59],
  [/banish/gi, 59],
  [/gather/gi, 59],
  [/examin/gi, 60],
  [/affection/gi, 60],
  [/rank/gi, 61],
  [/column/gi, 61],
  [/battle array/gi, 61],
  [/friday/gi, 62],
  [/congrega/gi, 62],
  [/hypocri/gi, 63],
  [/loss/gi, 64],
  [/cheat/gi, 64],
  [/depriv/gi, 64],
  [/illusion/gi, 64],
  [/divorce/gi, 65],
  [/prohibition/gi, 66],
  [/banning/gi, 66],
  [/forbid/gi, 66],
  [/mulk/gi, 67],
  [/dominion/gi, 67],
  [/sovereignty/gi, 67],
  [/kingship/gi, 67],
  [/kingdom/gi, 67],
  [/control/gi, 67],
  [/pen/gi, 68],
  [/reality/gi, 69],
  [/truth/gi, 69],
  [/Incontestable/gi, 69],
  [/Indubitable/gi, 69],
  [/ascen(t|d)/gi, 70],
  [/stairway/gi, 70],
  [/ladder/gi, 70],
  [/spirit/gi, 72],
  [/unseen being/gi, 72],
  [/enwrap/gi, 73],
  [/enshroud/gi, 73],
  [/bundle/gi, 73],
  [/wrap/gi, 74],
  [/cloak/gi, 74],
  [/shroud/gi, 74],
  [/resurrect/gi, 75],
  [/ris.{1,14}dead/gi, 75],
  [/man/gi, 76],
  [/emissar/gi, 77],
  [/winds? sent forth/gi, 77],
  [/dispached/gi, 77],
  [/tiding/gi, 78],
  [/announcement/gi, 78],
  [/great news/gi, 78],
  [/pull out/gi, 79],
  [/drag forth/gi, 79],
  [/Snatcher/gi, 79],
  [/Forceful Charger/gi, 79],
  [/frown/gi, 80],
  [/overthrow/gi, 81],
  [/Cessation/gi, 81],
  [/Darkening/gi, 81],
  [/Rolling/gi, 81],
  [/turning.{1,12}sphere/gi, 81],
  [/cleaving( asunder)?/gi, 82],
  [/burst(ing)? apart/gi, 82],
  [/shattering/gi, 82],
  [/splitting/gi, 82],
  [/Cataclysm/gi, 82],
  [/fraud/gi, 83],
  [/cheat/gi, 83],
  [/Stinter/gi, 83],
  [/Sundering/gi, 84],
  [/Splitting (Open|asunder)/gi, 84],
  [/constellation/gi, 85],
  [/mansion.{1,12}star/gi, 85],
  [/great star/gi, 85],
  [/galax(ies|y)/gi, 85],
  [/nightcomer/gi, 86],
  [/knocker/gi, 86],
  [/pounder/gi, 86],
  [/(bright|night|piercing|morning) star/gi, 86],
  [/high/gi, 87],
  [/overwhelming/gi, 88],
  [/pall/gi, 88],
  [/Overshadowing/gi, 88],
  [/Enveloper/gi, 88],
  [/dawn/gi, 89],
  [/break of day/gi, 89],
  [/city/gi, 90],
  [/land/gi, 90],
  [/sun/gi, 91],
  [/night/gi, 92],
  [/morning (light|hours|bright)/gi, 93],
  [/bright morning/gi, 93],
  [/early hours/gi, 93],
  [/forenoon/gi, 93],
  [/solace/gi, 94],
  [/comfort/gi, 94],
  [/heart/gi, 94],
  [/opening(-| )up/gi, 94],
  [/Consolation/gi, 94],
  [/relief/gi, 94],
  [/fig/gi, 95],
  [/clot/gi, 96],
  [/germ.?cell/gi, 96],
  [/embryo/gi, 96],
  [/cling/gi, 96],
  [/destiny/gi, 97],
  [/fate/gi, 97],
  [/power/gi, 97],
  [/decree/gi, 97],
  [/night.{1,10}(honor|majesty)/gi, 97],
  [/evidence/gi, 98],
  [/proof/gi, 98],
  [/sign/gi, 98],
  [/quake/gi, 99],
  [/charger/gi, 100],
  [/courser/gi, 100],
  [/Assaulter/gi, 100],
  [/calamity/gi, 101],
  [/shocker/gi, 101],
  [/rivalry/gi, 102],
  [/competition/gi, 102],
  [/hoard/gi, 102],
  [/worldly gain/gi, 102],
  [/time/gi, 103],
  [/declining day/gi, 103],
  [/epoch/gi, 103],
  [/eventide/gi, 103],
  [/gossip/gi, 104],
  [/slanderer/gi, 104],
  [/traducer/gi, 104],
  [/scandalmonger/gi, 104],
  [/Backbite/gi, 104],
  [/scorn/gi, 104],
  [/elephant/gi, 105],
  [/kindness/gi, 107],
  [/almsgiving/gi, 107],
  [/charity/gi, 107],
  [/Assistance/gi, 107],
  [/Necessaries/gi, 107],
  [/abundance/gi, 108],
  [/plenty/gi, 108],
  [/bounty/gi, 108],
  [/disbeliever/gi, 109],
  [/deny.{1,10}truth/gi, 109],
  [/kuff?aa?r/gi, 109],
  [/Atheist/gi, 109],
  [/help/gi, 110],
  [/support/gi, 110],
  [/palm fibre/gi, 111],
  [/rope/gi, 111],
  [/strand/gi, 111],
  [/Sincer/gi, 112],
  [/monotheism/gi, 112],
  [/absolute/gi, 112],
  [/unity/gi, 112],
  [/oneness/gi, 112],
  [/Fidelity/gi, 112],
  [/daybreak/gi, 113],
  [/rising dawn/gi, 113],
  [/men/gi, 114],
  [/people/gi, 114],
  [/mankind/gi, 114]

]
