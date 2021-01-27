const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const lunr = require('lunr');

// Creating line to [chapter,verseNo] mappings
// Array containing number of verses in each chapters
var chaplength = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6]
// contains chapter verse mappings for each line
var mappings = []
var mappingsStr = []

for (i = 1; i <= 114; i++) {
  for (j = 1; j <= chaplength[i - 1]; j++) {
    mappings.push([i, j])
    mappingsStr.push(i+","+j)
  }
}


// Search query to be entered by the user
var searchQuery = "what is the purpose of life"

var corsHerokuLinks = ['https://immense-castle-88569.herokuapp.com']

// Set the link here using current date to avoid shutdown of dyno
var corsHeroku = corsHerokuLinks[0]

var corsCloudflare = 'https://square-bread-052d.fawazahmed0.workers.dev'

var translateHeroku = 'https://calm-inlet-40245.herokuapp.com'

var googleSearchLink = 'https://www.google.com/search?&q='

var apiLink = 'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1'
var editionsLink = apiLink+'/editions'

//  english translation editions to use in lunr
var editionNames = ['eng-ummmuhammad.min.json','eng-abdullahyusufal.min.json','eng-muhammadtaqiudd.min.json']
// Contains english translation links to use in lunr
var translationLinks = editionNames.map(e=>editionsLink+'/'+e)

// This will contain the optimized english translations
var engTranslations = []

// Array containig lunrIndex for each verse
var lunrIndexArr = []

// Number of verses in quran
const VERSE_LENGTH = 6236

// numberpattern that match numbers less than 300 and with negative lookbehind and negative lookahead digits
//  i.e no digit front and end of match
var numberPattern = new RegExp(/(?<!\d)[0-2]?\d{1,2}(?!\d)/gi)





// Generates array containing lunrIndices
// https://lunrjs.com/guides/getting_started.html#creating-an-index
async function generateLunrIndex(){
// engTranslations = await getTranslations(translationLinks)
var flatTranslations = []
// folder contaning all the english translations in linebyline format
var transDir = "trans"
for (var filename of fs.readdirSync(transDir)) {
var myarr = fs.readFileSync(path.join(__dirname,transDir,filename)).toString().split(/\r?\n/)
flatTranslations.push(myarr.slice(0,6236))
}

// var flatTranslations = engTranslations.map(e=>e.flat())

for(var i = 0;i<VERSE_LENGTH;i++){

  var verse = flatTranslations.map((e,ind)=>{
    var obj = {};
    obj['id']= mappings[i].toString()+","+ind
    obj['text']=e[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z']/gi," ").replace(/\s\s+/gi, " ")
    return obj
})

  var idx = lunr(function () {
    this.ref('id')
    this.field('text')

    verse.forEach(function (doc) {
      this.add(doc)
    }, this)
  })

lunrIndexArr.push(idx)
}
// lunrIndexArr = qArrayOptimzer(lunrIndexArr)

    fs.writeFileSync("lunrIndexArr.min.json", JSON.stringify(lunrIndexArr))

}


// Fetches the translationLinks and returns the translations in optimized array form
async function getTranslations(linksarr){

var transJSON =  await getLinksJSON(linksarr)
return transJSON.map(e=>getOptimizedArr(e))

}
// optimizes a flat array of 6236 length to optimized array
// which can be accessed by arr[chap-1][verse-1]
function qArrayOptimzer(arr){
  // Temporarily stores the optimzed array
var tempArr = []
var counter = 0
  for (i = 1; i <= 114; i++) {
    if(!tempArr[i-1])
       tempArr[i-1] = []
    for (j = 1; j <= chaplength[i - 1]; j++) {
       tempArr[i-1][j-1]=arr[counter++]
    }
  }
return tempArr

}



// https://www.shawntabrizi.com/code/programmatically-fetch-multiple-apis-parallel-using-async-await-javascript/
// Get links async i.e in parallel
async function getLinksJSON(urls) {
        return await Promise.all(
          urls.map(url =>fetch(url).then(response => response.json()))
        ).catch(console.error)
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

generateLunrIndex()
