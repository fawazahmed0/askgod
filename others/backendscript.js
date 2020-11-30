const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')
const { firefox } = require('playwright')
const { JSDOM } = require('jsdom')
const { window } = new JSDOM('')
const $ = require('jquery')(window)
const use = require('@tensorflow-models/universal-sentence-encoder')
const tf = require('@tensorflow/tfjs')
const lunr = require('lunr')
require('@tensorflow/tfjs-node')

// Link having questions searched by user
const dbJSONLink = 'https://docs.google.com/spreadsheets/d/1THkt6fNsxKPQ2aE1GDnlzWzT9dt_CHmMijjScUw9z0s/gviz/tq?tqx=out:json'

// To allow going to any page
let page
// Allows closing of browser from anywhere
let browser

// Number of verses in quran
const VERSE_LENGTH = 6236

// No of chapters in quran
const CHAPTER_LENGTH = 114

// stores the translations
let translationsArr = []


const gestaltThreshold = 0.55

// Array containig lunrIndex for each verse
// let lunrIndexArr = []

const googleSearchLink = 'https://www.google.com/search?&q='

const apiLink = 'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1'
const editionsLink = apiLink+'/editions'

//  english translation editions to use in lunr
const editionNames = ['eng-ummmuhammad.min.json','eng-abdullahyusufal.min.json','eng-muhammadtaqiudd.min.json']
// Contains english translation links to use in lunr
const translationLinks = editionNames.map(e=>editionsLink+'/'+e)


// numberpattern that match numbers less than 300 and with negative lookbehind and negative lookahead digits
//  i.e no digit front and end of match
const numberPattern = /(?<!\d)[0-2]?\d{1,2}(?!\d)/gi

// Set this, so there is no mem leak
// Not sure this is requried at node side tough
// https://codepen.io/fawazahmed0/pen/JjKPzWy?editors=1011
// https://github.com/tensorflow/tfjs/issues/4015
tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0)

// Loading quran verse detection model
// var qverseModel = tf.loadLayersModel("https://cdn.jsdelivr.net/gh/fawazahmed0/quran-verse-detection@master/model/model.json");
// Loading universal sentence encoder model
const qverseModel = tf.loadLayersModel('file://C:/Users/Nawaz/Desktop/qadev/model/model.json')
const usemodel = use.load()

const models = Promise.all([qverseModel, usemodel])

// Returns array of questions searched by user
async function getDBArray () {
  const dbText = await fetch(dbJSONLink).then(response => response.text())
  const dbJSON = JSON.parse(dbText.match(/(?<=.*\().*(?=\);)/s)[0])
  const column = 1
  // console.log(JSON.stringify(dbJSON.table.rows.map(e=>e.c[column].v)))

  return dbJSON.table.rows.map(e => e.c[column].v)
}

// Remove the searches which are already there in the json
// Will be coding later
async function cleanArray () {

}

// Fetches the translationLinks and returns the translations in optimized array form
// Also assigns it to global translationsArr
async function getTranslations(linksarr){
  var transJSON =  await getLinksJSON(linksarr)
  translationsArr =  transJSON.map(e=>e.quran.map(e=>e.text)).map(e=>qArrayOptimzer(e))
  return translationsArr
  
  }
  // https://www.shawntabrizi.com/code/programmatically-fetch-multiple-apis-parallel-using-async-await-javascript/
// Get links async i.e in parallel
async function getLinksJSON(urls) {
  return await Promise.all(
    urls.map(url =>fetch(url).then(response => response.json()))
  ).catch(console.error)
}


// Takes links array to be fetched and returns merged html of all links
// Usually getGoogleLinks() result is passed in here
async function linksFetcher (linksarr) {
// stores html for all links
  let tempHTML = ''

  for (const link of linksarr) {
    await page.goto(link, { timeout: 60000 })
    //  await page.addScriptTag({url: 'https://code.jquery.com/jquery-3.5.1.min.js'})
    tempHTML = tempHTML + await page.evaluate(() => {
      // Remove few tags from html as they don't parse well
      function removeTag (tag) {
        const elements = document.getElementsByTagName(tag)
        for (let i = elements.length; i-- > 0;) { elements[i].parentNode.removeChild(elements[i]) }
      }
      // remove script and style tags
      removeTag('script')
      removeTag('style')
      return document.documentElement.outerHTML
    })
  //  tempStr = tempStr+ await page.evaluate(() => $(document).find("script,style").remove().end().text());
  }
  // removing css,html,links,ISBN,17+ character length,multiple spaces from str to narrow down the search
  // tempStr = tempStr.replace(/<([A-Z][A-Z0-9]*)\b[^>]*>(.*?)<\/\1>/gi," ").replace(/<([A-Z][A-Z0-9]*)>.*?<\/\1>/gi," ").replace(/<([A-Z][A-Z0-9]*)\b[^>]*\/?>(.*?)/gi," ").replace(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi," ").replace(/(?<=\s)[^ ]*\s*\{[^\}]+\:[^\}]+\}/gi," ").replace(/[^\s]{17,}/gi," ").replace(/\d{4,}/gi," ").replace(/\s\s+/g, " ")
  // tempStr = await page.evaluate(() => $(document).find("script,style").remove().end().text());
  await browser.close()

  return tempHTML
}

// Tested
// linksFetcher(['https://stackoverflow.com/questions/28123687/extract-visible-text-from-all-elements-in-chrome-browser-using-javascript','https://www.npmjs.com/package/jquery']).then(console.log)

// Page and browser is a global variable and it can be accessed from anywhere
// function that launches a browser
async function launchBrowser (linkToOpen, downloadPathDir) {
  browser = await firefox.launch({
    headless: false,
    downloadsPath: downloadPathDir
  })
  const context = await browser.newContext({
    acceptDownloads: true
  })
  page = await context.newPage()
  if (linkToOpen) {
    await page.goto(linkToOpen, {
      timeout: 60000
    })
  }
  // Load jquery in the page
  // later remove this after fix, https://github.com/microsoft/playwright/issues/4284
//  await page.addInitScript(fs.readFileSync('jquery-3.5.1.min.js', 'utf8'));
}

async function getGoogleLinks (query) {
  // This should be kept somewhere else

  await page.goto(googleSearchLink + encodeURIComponent(query), {
    timeout: 60000
  })
  // await browser.close();

  let hrefs = await page.evaluate(() => {
    return Array.from(document.links).map(item => item.href + '')
  })

  hrefs = hrefs.map(e => e.split('#')[0])

  hrefs = [...new Set(hrefs)]

  hrefs = hrefs.filter(e => !/(google|youtube)/i.test(e))

  return hrefs
}

// Takes html as input and returns regex cleaned string
function htmlToString (htmlString) {
  // await page.addScriptTag({url: 'https://code.jquery.com/jquery-3.5.1.min.js'})
  // convert html to string

  //  str = await page.evaluate(() => {
  //    return $.parseHTML(htmlString).reduce((full, val) => full+" "+val.textContent)
  //  });
  let str = $.parseHTML(htmlString).reduce((full, val) => full + ' ' + val.textContent)
  // removing css,html,links,ISBN,17+ character length,multiple spaces from str to narrow down the search
  str = str.replace(/<([A-Z][A-Z0-9]*)\b[^>]*>(.*?)<\/\1>/gi, ' ').replace(/<([A-Z][A-Z0-9]*)>.*?<\/\1>/gi, ' ').replace(/<([A-Z][A-Z0-9]*)\b[^>]*\/?>(.*?)/gi, ' ').replace(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi, ' ').replace(/(?<=\s)[^ ]*\s*\{[^\}]+\:[^\}]+\}/gi, ' ').replace(/[^\s]{17,}/gi, ' ').replace(/\d{4,}/gi, ' ').replace(/\s\s+/g, ' ')

  return str
}

// Begins inference
async function inference () {
// Note we have to clean the array before wasting resources for already embedded queries
  const searchArr = await getDBArray()
  // Launch the browser
  await launchBrowser()

  for (const query of searchArr) {
    // Stores the links we got from google search
    const linksarr = await getGoogleLinks(query)
    // stores the  html string for all the links we got from previous google search step
    const htmlStr = await linksFetcher(linksarr)
    // stores the parsed html string
    const parsedStr = htmlToString(htmlStr)
    // Takes
    // tensorBruteInference(parsedStr)
  }
}
/*
async function loadModels(){
loadModels = function(){};
  models = await models
  qverseModel = await qverseModel
  usemodel = await usemodel

}
*/

/*
function getLunrIndex () {
  const lunrJSON = JSON.parse(fs.readFileSync(path.join(__dirname, 'lunrIndexArrNode.min.json')).toString())
  lunrIndexArr = lunrJSON.map(e => lunr.Index.load(e))

  lunrIndexArr = qArrayOptimzer(lunrIndexArr)
}
*/

// optimizes a flat array of 6236 length to optimized array
// which can be accessed by arr[chap-1][verse-1]
function qArrayOptimzer (arr) {
  // Temporarily stores the optimzed array
  const tempArr = []
  let counter = 0
  for (i = 1; i <= 114; i++) {
    if (!tempArr[i - 1]) { tempArr[i - 1] = [] }
    for (j = 1; j <= chaplength[i - 1]; j++) {
      tempArr[i - 1][j - 1] = arr[counter++]
    }
  }
  return tempArr
}

/*
// Have to test this later again
// Using lunr.js ,as it's better in document search
// Remeber to keep query of similar length as of verse
function lunrSearchCheck(lunrIndex, query) {

  // count no of words in query
  // Ref: https://stackoverflow.com/questions/18679576/counting-words-in-string
  var queryLength = query.trim().split(/\s+/).length;
  var scoreThreshold;

  if (queryLength > 300) {
    // Seeing the coorelation pattern below, I got to this scoreThreshold
    // This was checked by manually performing queries and noting the score
    scoreThreshold = 1.15 / 250 * queryLength;
  } else if (queryLength > 250) {
    scoreThreshold = 1.6;
  } else if (queryLength > 200) {
    scoreThreshold = 1.5;
  } else if (queryLength > 150) {
    scoreThreshold = 1.3;
  } else if (queryLength > 100) {
    scoreThreshold = 1.1;
  } else if (queryLength > 70) {
    scoreThreshold = 1;
  } else if (queryLength > 40) {
    scoreThreshold = 0.95;
  } else if (queryLength > 35) {
    scoreThreshold = 0.9;
  } else if (queryLength > 25) {
    scoreThreshold = 0.69;
  } else if (queryLength > 12) {
    scoreThreshold = 0.49;
  } else if (queryLength > 4) {
    scoreThreshold = 0.35;
  } else {
    scoreThreshold = 0.25;
  }

  try {
    // If this throws error, it means query has no match
//    if (lunrIndex.search(query)[0].score > scoreThreshold) {
      return lunrIndex.search(query)[0].score
  //  }
//    return false
  } catch (error) {
    return 0
  }

}
*/

async function gestaltInference(parsedString){
  // Get all the translations
  await getTranslations(translationLinks)

  const numbers = Array.from(parsedString.matchAll(numberPattern)).filter(e => e[0] > 0 && e[0] <= 286)

  for(let i=0;i<numbers.length;i++){




  }

  
}



// Takes parsedStr as input and returns confirmed verses
async function tensorBruteInference (parsedString) {
  // Get all the translations
  await getTranslations(translationLinks)
  // load the models, call this only one time
//  await loadModels()
// Get numbers in parsedString
  const numbers = Array.from(parsedString.matchAll(numberPattern)).filter(e => e[0] > 0 && e[0] <= 286)

  // stores the chapter,verse and string to embed
  let embedArr = []

  for (let i = 0; i < numbers.length; i++) {
    const twoNum = numbers[i + 1] && numbers[i + 1].index - 40 < numbers[i].index
    const threeNum = numbers[i + 1] && numbers[i + 2] && numbers[i + 1].index - 40 < numbers[i].index && numbers[i + 2].index - 40 < numbers[i].index
    // I can remove this pattern checks, to make sure I catch all verses
    // can try later commenting it

    // assuming Chapter Number pattern (with no ayah, i.e full chapter) Eg: Chapter 110
    embedArr = embedArr.concat(getChapMultiVerStrArr(numbers[i][0], 1, chaplength[numbers[i][0] - 1], numbers[i].index, parsedString))
    embedArr = embedArr.concat(getChapMultiVerStrArr(numbers[i][0], 1, chaplength[numbers[i][0] - 1], numbers[i].index, parsedString, true))

    // if number exists next to this number i.e within 40 chars
    // assuming chapter verse pattern and verse chapter pattern
    if (twoNum) {
      // assuming chapter verse pattern
      embedArr = embedArr.concat(getChapVerStrArr(numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString))
      embedArr = embedArr.concat(getChapVerStrArr(numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, true))
      // assuming verse ,chapter pattern
      embedArr = embedArr.concat(getChapVerStrArr(numbers[i + 1][0], numbers[i][0], numbers[i].index, parsedString))
      embedArr = embedArr.concat(getChapVerStrArr(numbers[i + 1][0], numbers[i][0], numbers[i].index, parsedString, true))
    }
    for (const patt of arabicEnglishQuranName) {
      const chapNameExists = new RegExp(patt[0]).test(parsedString.substring(numbers[i].index - 40, numbers[i].index + 40))
      const chapter = chapNameExists ? patt[1] : undefined

      if (chapNameExists) {
        // assuming chapter name , verse pattern
        embedArr = embedArr.concat(getChapVerStrArr(chapter, numbers[i][0], numbers[i].index, parsedString))
        embedArr = embedArr.concat(getChapVerStrArr(chapter, numbers[i][0], numbers[i].index, parsedString, true))
      }
      // assuming chapter name, multi verse pattern
      if (chapNameExists && twoNum) {
        // chapter Name, verse1 to verse2 pattern
        embedArr = embedArr.concat(getChapMultiVerStrArr(chapter, numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString))
        embedArr = embedArr.concat(getChapMultiVerStrArr(chapter, numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, true))
        //  verse1 to verse2, chapter Name pattern
        embedArr = embedArr.concat(getChapMultiVerStrArr(chapter, numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString))
        embedArr = embedArr.concat(getChapMultiVerStrArr(chapter, numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, true))
      }
    }
    // assuming chapter number multi verse
    if (threeNum) {
      // chapter Number, verse1 to verse2 pattern
      embedArr = embedArr.concat(getChapMultiVerStrArr(numbers[i][0], numbers[i + 1][0], numbers[i + 2][0], numbers[i].index, parsedString))
      embedArr = embedArr.concat(getChapMultiVerStrArr(numbers[i][0], numbers[i + 1][0], numbers[i + 2][0], numbers[i].index, parsedString, true))

      //  verse1 to verse2, chapter Number pattern
      embedArr = embedArr.concat(getChapMultiVerStrArr(numbers[i + 2][0], numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString))
      embedArr = embedArr.concat(getChapMultiVerStrArr(numbers[i + 2][0], numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, true))
    }
  }
  return embedArr
}


// Returns gestalt ratio between two given string
function getGestaltRatio(str1,str2){
  return new difflib.SequenceMatcher(null, str1, str2).ratio()
} 

// Takes chapterNo  VerseNo and content and compares both of them
// shoudn't waste time on what's already exist
// Returns verse in an array if the ratio is more than a given threshold
function getGestaltArr(chapter, verse, index, parsedString, front) {
  // Parsing the strings to int ,as in case of comparsion like "17">"2"-> false as both are string
  // Avoiding bugs like above
  chapter = parseInt(chapter)
  verse = parseInt(verse)
  index = parseInt(index)

    // return with empty array if chap verse doesn't exist
    if (chapter > CHAPTER_LENGTH || !translationsArr[0][chapter - 1][verse - 1]) { return false }

    for(const translation of translationsArr){

      let verseStr = translation[chapter - 1][verse - 1]
      let verseLen = verseStr.length



    }


}



// reduce embedding size by keeping flow in chap ver direction and after embed I can test for ver chap dir

// Takes chapter, verse no ,parsedstring and returns chap,ver and variable length string in array

function getChapVerStrArr (chapter, verse, index, parsedString, front) {
// Parsing the strings to int ,as in case of comparsion like "17">"2"-> false as both are string
  // Avoiding bugs like above
  chapter = parseInt(chapter)
  verse = parseInt(verse)
  index = parseInt(index)

  // return with empty array if chap verse doesn't exist
  if (chapter > CHAPTER_LENGTH || !verseLenArr[chapter - 1][verse - 1]) { return [] }

  const verseLen = verseLenArr[chapter - 1][verse - 1]
  // stores the chapter,verse and string to embed
  const chapVerStrArr = []
  // increament/decrement percentage of verseLen by this value each time
  const percent = 5
  // number of times to increament/decrement the value of verse length
  const times = 6

  const decArr = [...Array(times + 1).keys()].slice(1).map(e => e * -5)
  const incArr = [...Array(times + 1).keys()].slice(1).map(e => e * 5)
  // stores varying verse length for specific chapter and verse, as tensorflow model needs
  // proper verse length, we will brute the verse length to get the proper one
  var verseLenArr = decArr.concat(0, incArr).map(e => verseLen + (verseLen * e / 100))
  let content

  for (const len of verseLenArr) {
    if (front) {
      content = parsedString.substring(index - 6, index + len)
      // assuming front pattern
      chapVerStrArr.push(cleanPatterns(content, true))
    } else {
      content = parsedString.substring(index - len, index + 6)
      chapVerStrArr.push(cleanPatterns(content))
    }
  }
  // Make chapVerStrArr into ["chapter,verse","stringtoembed"] form
  return chapVerStrArr.map(e => [chapter + ',' + verse, e])
}

function getChapMultiVerStrArr (chapter, verseFrom, verseTo, index, parsedString) {
  // return with empty array if chap verse doesn't exist
  // also add code to return if total word length is gerater than a value to avoid wasting resources on large false matches

  // Parsing the strings to int ,as in case of comparsion like "17">"2"-> false as both are string
  // Avoiding bugs like above
  chapter = parseInt(chapter)
  verseFrom = parseInt(verseFrom)
  verseTo = parseInt(verseTo)
  index = parseInt(index)

  if (chapter > CHAPTER_LENGTH || !verseLenArr[chapter - 1][verseTo - 1] || verseFrom >= verseTo ||
  // return if the multiverse is huge is size
verseLenArr[chapter - 1].slice(verseFrom - 1, verseTo).reduce((full, e) => full + e) > 1500) { return [] }

  // stores the chapter,verse and string to embed
  let chapMultiVerStrArr = []
  let backIndex = index
  let frontIndex = index

  for (let i = verseFrom; i <= verseTo; i++) {
    chapMultiVerStrArr = chapMultiVerStrArr.concat(getChapVerStrArr(chapter, i, backIndex, parsedString))
    backIndex = backIndex - verseLenArr[chapter - 1][i - 1]

    chapMultiVerStrArr = chapMultiVerStrArr.concat(getChapVerStrArr(chapter, i, frontIndex, parsedString, true))
    frontIndex = frontIndex + verseLenArr[chapter - 1][i - 1]
  }
  return chapMultiVerStrArr
}


// similar to arr1.filter(e => arr2.includes(e))
// but also adds duplicates common
// Take arrays or strings to compare
// return array with common values
// https://itnext.io/string-similarity-the-basic-know-your-algorithms-guide-3de3d7346227
function arrDupIntersection (arr1, arr2) {
  arr1 = Array.isArray(arr1) ? arr1 : (arr1 + '').split('')
  arr2 = Array.isArray(arr2) ? arr2 : (arr2 + '').split('')
  return arr1.filter(e => {
    idx = arr2.indexOf(e)
    if (idx == -1) { return false }

    arr2.splice(idx, 1)
    return true
  })
}

function test () {
  const bigstr = fs.readFileSync(path.join(__dirname, 'notehtmlstr')).toString()
  const parsedStr = htmlToString(bigstr)
  // Get numbers in parsedString
  const numbers = Array.from(parsedStr.matchAll(numberPattern)).filter(e => e[0] > 0 && e[0] <= 286)
  getLunrIndex()
  let testarr = tensorBruteInference(parsedStr)

  // console.log(verseLenArr['0'])
  for (let i = 0; i < numbers.length - 2; i++) {
    // console.log()
    // testarr = testarr.concat(getChapMultiVerStrArr(numbers[i][0],numbers[i+1][0],numbers[i+2][0],numbers[i].index, parsedStr))
  }
  // testarr = testarr.filter(e=>lunrSearchCheck(lunrIndexArr[e[0].split(',')[0]-1][e[0].split(',')[1]-1],e[1]))
  testarr = testarr.map(e => e.concat(lunrSearchCheck(lunrIndexArr[e[0].split(',')[0] - 1][e[0].split(',')[1] - 1], e[1])))
  console.log(testarr.length)
  fs.writeFileSync('testarr', JSON.stringify(testarr, null, 4))
}

// Remove the numbers, patterns such as 3:4 ,etc from the given string
// And return the cleaned one
// Also remove  alphanumeric chars, removing all punctuations , double whitespaces
// Don't remove englishquranname patterns

function cleanPatterns (str, front) {
  var str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const charCount = 7
  let fullPattern
  if (front) { fullPattern = new RegExp('^.{0,' + charCount + '}?' + cleanStrPattern.source, 'si') } else { fullPattern = new RegExp(cleanStrPattern.source + '.{0,' + 7 + '}$', 'si') }

  for (let i = 0; i < 50; i++) { str = str.replace(fullPattern, ' ') }

  return str.split(/\s/).slice(1, -1).join(' ').replace(/[^A-Z\s]|_/gi, ' ').replace(/\s\s+/g, ' ').trim()
}

// Matches quran, surah, ayah, names of surah etc
const confirmPattern = [
  /\b(q|k)(u|o)r.{1,4}n/gi,
  /\bs(ū|u|o){1,2}ra/gi,
  /\b(a|ā)y(a|ā)/gi,
  /\bverse/gi,
  /\bchapter/gi,
  /\b[0-9]{1,3}\s{0,5}:\s{0,5}[0-9]{1,3}\s{0,5}(-|to|and)\s{0,5}[0-9]{1,3}/gi,
  /\b[0-9]{1,3}\s{0,5}:\s{0,5}[0-9]{1,3}/gi
]

const multiVersePattern = /\s[0-9]{1,3}\s{0,5}:\s{0,5}[0-9]{1,3}\s{0,5}(-|to|and)\s{0,5}[0-9]{1,3}/gi

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
const arabicQuranName = [
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

const englishQuranName = [
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

// Contains average verse length for english quran translation in optimized format
var verseLenArr = [[59, 70, 37, 54, 55, 27, 121], [44, 154, 155, 204, 79, 130, 146, 111, 110, 147, 99, 73, 205, 178, 102, 122, 172, 64, 255, 274, 124, 249, 234, 134, 409, 383, 216, 195, 190, 325, 139, 137, 223, 171, 204, 252, 145, 180, 134, 185, 248, 131, 117, 159, 179, 98, 135, 182, 209, 130, 147, 65, 124, 346, 161, 71, 211, 266, 211, 298, 653, 266, 236, 128, 139, 126, 205, 207, 158, 148, 237, 127, 170, 317, 210, 324, 75, 126, 216, 234, 133, 132, 396, 186, 553, 151, 356, 156, 340, 319, 323, 130, 361, 143, 151, 335, 246, 140, 157, 132, 223, 770, 135, 164, 273, 167, 150, 176, 312, 182, 169, 268, 330, 324, 169, 192, 110, 261, 215, 347, 256, 136, 181, 298, 422, 336, 195, 245, 257, 198, 129, 199, 275, 167, 221, 361, 220, 135, 229, 326, 167, 232, 561, 436, 390, 190, 61, 216, 183, 369, 241, 107, 111, 124, 157, 94, 143, 285, 199, 168, 138, 105, 122, 502, 341, 179, 287, 141, 107, 204, 183, 150, 338, 266, 147, 144, 645, 463, 134, 205, 137, 186, 137, 384, 608, 258, 844, 217, 319, 153, 302, 60, 215, 279, 183, 930, 423, 291, 144, 335, 159, 85, 271, 181, 154, 142, 122, 156, 122, 184, 228, 266, 498, 334, 227, 211, 670, 186, 311, 378, 537, 458, 261, 205, 175, 179, 74, 519, 665, 384, 540, 342, 760, 309, 467, 325, 440, 151, 183, 319, 111, 75, 239, 78, 185, 560, 443, 317, 607, 169, 343, 119, 533, 213, 589, 248, 304, 450, 695, 407, 259, 227, 133, 433, 347, 365, 347, 197, 167, 147, 235, 305, 364, 185, 491, 129, 193, 121, 211, 174, 146, 1476, 352, 264, 366, 529], [44, 97, 190, 218, 66, 122, 625, 154, 135, 155, 203, 124, 355, 280, 319, 121, 199, 230, 289, 391, 193, 114, 206, 155, 191, 271, 270, 281, 184, 266, 170, 114, 112, 69, 219, 303, 363, 145, 292, 142, 245, 155, 130, 276, 271, 96, 194, 108, 473, 205, 86, 236, 161, 99, 435, 137, 152, 89, 128, 63, 310, 163, 92, 315, 162, 188, 158, 203, 152, 147, 114, 195, 424, 98, 411, 108, 281, 278, 352, 149, 430, 82, 210, 342, 153, 212, 106, 103, 109, 222, 248, 175, 204, 98, 143, 133, 336, 137, 254, 152, 219, 162, 413, 205, 142, 247, 121, 127, 115, 383, 142, 413, 185, 202, 110, 224, 288, 347, 342, 236, 166, 139, 178, 148, 172, 161, 118, 162, 168, 107, 60, 63, 151, 157, 263, 202, 195, 108, 102, 309, 95, 150, 120, 296, 270, 264, 187, 131, 135, 72, 229, 478, 370, 804, 246, 365, 139, 73, 358, 157, 280, 190, 84, 317, 246, 137, 371, 210, 129, 222, 128, 158, 235, 162, 162, 211, 135, 200, 340, 394, 246, 113, 310, 164, 274, 375, 298, 202, 100, 139, 313, 130, 258, 157, 468, 85, 93, 235, 323, 157], [304, 203, 320, 210, 187, 496, 167, 177, 197, 137, 719, 730, 223, 172, 240, 226, 187, 236, 370, 206, 116, 142, 607, 542, 737, 177, 135, 99, 211, 116, 153, 257, 223, 571, 251, 316, 190, 199, 174, 149, 121, 169, 551, 146, 117, 443, 314, 203, 200, 81, 207, 105, 119, 220, 127, 249, 274, 241, 282, 304, 158, 185, 184, 306, 231, 262, 67, 50, 273, 69, 106, 166, 221, 211, 304, 195, 570, 339, 202, 129, 291, 136, 378, 264, 191, 174, 188, 289, 337, 437, 374, 735, 188, 425, 454, 105, 370, 122, 101, 290, 203, 696, 246, 231, 194, 80, 125, 231, 181, 126, 96, 138, 409, 280, 236, 197, 127, 94, 291, 113, 83, 251, 205, 192, 247, 115, 443, 305, 323, 149, 336, 123, 109, 165, 377, 291, 185, 79, 163, 322, 405, 210, 166, 150, 101, 246, 132, 139, 156, 219, 99, 184, 396, 255, 351, 103, 381, 100, 233, 165, 196, 311, 280, 142, 175, 179, 178, 169, 84, 241, 562, 197, 305, 130, 156, 573], [272, 676, 930, 399, 701, 623, 194, 251, 133, 102, 238, 470, 365, 321, 260, 185, 396, 382, 344, 234, 147, 164, 234, 158, 135, 190, 325, 165, 168, 130, 237, 458, 336, 139, 143, 236, 117, 178, 159, 181, 677, 305, 198, 514, 343, 286, 199, 604, 366, 141, 268, 310, 207, 410, 189, 142, 250, 142, 249, 347, 181, 153, 164, 572, 203, 322, 245, 373, 265, 232, 217, 341, 248, 95, 338, 158, 259, 198, 132, 225, 207, 314, 235, 193, 163, 108, 179, 108, 533, 219, 194, 197, 314, 258, 575, 254, 363, 84, 140, 284, 261, 85, 407, 245, 337, 542, 338, 278, 219, 773, 177, 192, 153, 261, 199, 417, 288, 124, 262, 123], [173, 163, 152, 121, 136, 332, 186, 162, 180, 121, 84, 309, 108, 327, 78, 124, 136, 101, 406, 201, 159, 188, 140, 99, 359, 153, 220, 188, 111, 238, 283, 161, 165, 278, 336, 152, 146, 218, 181, 171, 172, 173, 178, 255, 116, 257, 156, 169, 137, 266, 237, 244, 184, 294, 120, 211, 235, 167, 310, 263, 224, 147, 217, 111, 266, 110, 97, 277, 179, 532, 465, 102, 293, 139, 124, 139, 161, 188, 160, 299, 255, 158, 160, 225, 90, 114, 120, 188, 224, 173, 520, 277, 568, 355, 227, 189, 203, 203, 510, 214, 165, 165, 114, 209, 183, 151, 163, 266, 245, 181, 240, 264, 192, 277, 137, 157, 107, 129, 335, 131, 381, 273, 163, 330, 257, 116, 131, 430, 116, 340, 150, 106, 202, 98, 210, 343, 308, 356, 303, 213, 386, 213, 241, 395, 509, 319, 165, 400, 135, 332, 459, 389, 219, 224, 141, 154, 456, 385, 213, 252, 211, 130, 90, 305, 265], [52, 168, 206, 145, 107, 105, 104, 139, 150, 136, 198, 170, 135, 71, 49, 111, 165, 139, 158, 235, 89, 339, 138, 150, 105, 263, 326, 232, 382, 191, 184, 359, 307, 142, 195, 152, 470, 419, 129, 273, 125, 180, 454, 311, 131, 334, 146, 185, 182, 221, 232, 135, 475, 397, 86, 165, 312, 251, 187, 71, 126, 115, 176, 178, 171, 131, 119, 93, 312, 183, 239, 158, 396, 288, 253, 80, 171, 84, 168, 139, 113, 131, 97, 109, 409, 258, 203, 246, 382, 119, 86, 140, 194, 172, 238, 241, 109, 112, 128, 207, 271, 115, 168, 89, 174, 104, 73, 78, 84, 68, 100, 48, 109, 82, 86, 157, 125, 69, 72, 47, 62, 32, 191, 102, 49, 203, 265, 211, 220, 133, 243, 143, 179, 246, 121, 145, 359, 306, 128, 130, 211, 322, 484, 176, 271, 448, 176, 257, 165, 503, 134, 176, 136, 145, 493, 340, 652, 423, 113, 467, 270, 170, 311, 230, 195, 161, 279, 228, 530, 145, 265, 313, 247, 97, 183, 388, 101, 111, 275, 189, 106, 121, 56, 102, 215, 118, 390, 275, 368, 188, 94, 64, 125, 144, 235, 121, 90, 103, 83, 114, 140, 100, 259, 166, 184, 133], [239, 205, 86, 128, 131, 135, 270, 116, 155, 160, 276, 237, 146, 99, 108, 226, 226, 85, 305, 110, 63, 111, 163, 241, 159, 237, 134, 113, 224, 210, 171, 160, 135, 216, 152, 254, 235, 210, 215, 125, 407, 512, 287, 251, 144, 184, 185, 369, 199, 182, 102, 210, 175, 265, 110, 118, 130, 173, 126, 333, 134, 145, 201, 93, 278, 315, 266, 113, 125, 231, 172, 505, 236, 230, 250], [155, 193, 390, 268, 341, 233, 282, 284, 157, 122, 190, 218, 233, 147, 126, 292, 252, 228, 313, 211, 140, 82, 182, 390, 235, 215, 103, 301, 313, 256, 377, 198, 187, 315, 280, 424, 380, 293, 175, 510, 175, 320, 200, 180, 160, 223, 284, 166, 185, 159, 146, 229, 144, 238, 207, 133, 125, 193, 244, 366, 296, 153, 157, 202, 186, 167, 331, 209, 421, 317, 341, 249, 149, 549, 195, 122, 196, 129, 278, 297, 318, 96, 286, 208, 189, 247, 133, 194, 120, 245, 278, 259, 227, 386, 235, 173, 198, 186, 321, 351, 284, 213, 210, 171, 230, 140, 310, 295, 325, 172, 414, 415, 236, 336, 164, 164, 304, 424, 78, 526, 225, 277, 159, 198, 158, 137, 216, 266, 166], [178, 347, 317, 348, 296, 184, 176, 67, 229, 240, 289, 299, 208, 92, 355, 192, 158, 289, 213, 171, 241, 400, 281, 536, 135, 219, 325, 281, 98, 191, 317, 115, 128, 179, 287, 143, 296, 166, 220, 141, 152, 118, 102, 85, 246, 206, 160, 87, 246, 147, 133, 135, 165, 267, 158, 74, 211, 127, 222, 204, 402, 162, 86, 178, 125, 233, 185, 235, 68, 182, 373, 194, 235, 225, 182, 83, 128, 183, 57, 83, 188, 111, 278, 124, 124, 54, 208, 314, 195, 304, 101, 177, 288, 261, 106, 84, 83, 285, 159, 123, 137, 159, 122, 231, 193, 154, 252, 255, 124], [200, 125, 319, 58, 247, 192, 302, 247, 120, 171, 116, 301, 187, 206, 146, 152, 505, 254, 138, 229, 101, 73, 184, 149, 91, 86, 274, 249, 225, 100, 344, 163, 98, 166, 168, 153, 157, 201, 141, 286, 157, 190, 261, 270, 152, 198, 177, 280, 197, 163, 126, 214, 142, 199, 80, 165, 221, 137, 184, 186, 298, 269, 230, 171, 137, 203, 105, 123, 172, 179, 157, 145, 176, 146, 109, 149, 170, 298, 120, 107, 348, 137, 83, 269, 163, 125, 250, 370, 199, 112, 227, 181, 224, 206, 111, 89, 130, 147, 157, 150, 228, 142, 188, 47, 125, 111, 161, 184, 213, 239, 129, 212, 148, 221, 86, 322, 99, 126, 203, 225, 90, 32, 215], [122, 76, 180, 159, 153, 265, 98, 158, 181, 160, 110, 90, 135, 115, 216, 62, 179, 219, 246, 124, 337, 124, 277, 239, 260, 204, 96, 143, 102, 170, 358, 249, 219, 114, 105, 332, 345, 247, 113, 292, 249, 251, 243, 96, 162, 236, 168, 164, 122, 232, 307, 152, 176, 201, 137, 213, 141, 111, 225, 110, 98, 202, 218, 192, 345, 286, 249, 283, 167, 192, 61, 136, 116, 92, 168, 394, 269, 169, 143, 361, 167, 115, 208, 144, 127, 109, 181, 248, 90, 287, 99, 119, 133, 159, 61, 191, 92, 107, 136, 476, 308, 191, 75, 119, 102, 100, 188, 291, 328, 282, 266], [192, 371, 304, 333, 363, 262, 138, 155, 71, 147, 358, 141, 243, 325, 179, 506, 487, 395, 180, 77, 195, 246, 210, 92, 263, 208, 196, 159, 137, 329, 547, 166, 450, 147, 253, 334, 223, 214, 94, 178, 193, 178, 198], [285, 138, 167, 228, 242, 294, 190, 132, 411, 374, 254, 220, 224, 160, 143, 87, 188, 237, 141, 48, 397, 463, 231, 186, 138, 119, 217, 159, 68, 146, 252, 281, 144, 227, 141, 173, 287, 131, 132, 124, 110, 149, 147, 292, 158, 257, 126, 162, 132, 65, 101, 200], [103, 145, 113, 74, 55, 94, 68, 118, 95, 88, 59, 93, 109, 97, 91, 95, 69, 82, 138, 121, 129, 197, 92, 120, 83, 68, 64, 123, 128, 54, 62, 92, 122, 84, 71, 84, 48, 35, 154, 51, 72, 130, 51, 83, 82, 65, 134, 79, 80, 58, 48, 94, 91, 110, 82, 81, 83, 79, 79, 89, 62, 42, 80, 87, 169, 110, 67, 57, 34, 90, 84, 93, 55, 97, 71, 75, 47, 90, 81, 66, 63, 75, 73, 59, 205, 53, 109, 182, 47, 74, 65, 65, 24, 119, 52, 71, 64, 86, 71], [175, 191, 105, 98, 120, 130, 149, 138, 238, 128, 164, 165, 176, 280, 135, 78, 78, 121, 53, 90, 81, 149, 98, 109, 186, 210, 289, 266, 99, 278, 167, 192, 244, 109, 309, 326, 151, 181, 175, 85, 212, 87, 184, 212, 177, 120, 121, 171, 167, 73, 168, 170, 119, 108, 141, 179, 113, 123, 188, 153, 281, 237, 216, 192, 156, 182, 168, 116, 235, 216, 270, 247, 147, 96, 323, 271, 187, 172, 185, 336, 326, 88, 117, 206, 123, 242, 161, 178, 306, 403, 202, 453, 190, 298, 124, 182, 258, 98, 87, 121, 207, 194, 185, 136, 122, 241, 126, 104, 54, 223, 175, 317, 164, 144, 315, 203, 79, 172, 185, 194, 119, 93, 166, 176, 249, 187, 155, 91], [292, 155, 100, 174, 202, 138, 328, 202, 197, 141, 132, 295, 149, 106, 235, 266, 139, 217, 205, 129, 136, 133, 239, 143, 174, 149, 107, 201, 144, 147, 129, 136, 315, 199, 133, 209, 139, 70, 214, 141, 166, 174, 154, 219, 140, 245, 183, 97, 109, 34, 288, 157, 178, 169, 189, 179, 261, 163, 246, 346, 158, 193, 120, 318, 123, 141, 192, 216, 205, 218, 285, 115, 203, 84, 180, 167, 129, 231, 214, 172, 138, 164, 156, 139, 183, 164, 90, 172, 151, 105, 115, 129, 283, 136, 152, 121, 336, 181, 260, 175, 188, 232, 99, 232, 211, 160, 205, 84, 81, 232, 216], [120, 217, 33, 78, 160, 142, 196, 90, 115, 165, 100, 136, 141, 272, 192, 245, 380, 337, 504, 146, 416, 472, 63, 167, 80, 271, 197, 385, 404, 149, 306, 184, 137, 172, 120, 154, 193, 93, 182, 170, 98, 259, 86, 160, 280, 216, 177, 211, 400, 322, 180, 213, 141, 139, 267, 264, 359, 237, 121, 158, 127, 166, 206, 104, 127, 139, 69, 75, 98, 108, 197, 83, 100, 204, 79, 133, 296, 150, 181, 129, 111, 398, 91, 83, 22, 232, 162, 153, 27, 135, 62, 27, 127, 184, 174, 223, 84, 156, 158, 70, 108, 209, 85, 110, 214, 137, 130, 76, 200, 233], [55, 72, 46, 152, 110, 148, 152, 106, 123, 157, 143, 117, 85, 79, 105, 122, 146, 103, 93, 86, 176, 82, 162, 121, 91, 179, 132, 131, 89, 100, 109, 68, 101, 96, 194, 137, 177, 142, 151, 95, 89, 130, 133, 98, 144, 149, 116, 159, 156, 114, 105, 107, 72, 124, 102, 90, 35, 350, 179, 141, 157, 159, 113, 185, 227, 75, 70, 147, 122, 78, 103, 130, 248, 122, 288, 233, 137, 83, 80, 109, 115, 104, 105, 114, 110, 102, 117, 130, 46, 104, 61, 97, 97, 68, 83, 136, 180, 134], [39, 73, 49, 67, 77, 115, 110, 79, 41, 161, 59, 92, 64, 126, 125, 138, 46, 112, 37, 60, 81, 111, 51, 82, 72, 22, 104, 32, 41, 20, 30, 41, 33, 24, 37, 53, 60, 54, 281, 408, 37, 114, 93, 75, 120, 70, 233, 130, 74, 95, 63, 103, 214, 100, 112, 82, 87, 199, 114, 66, 179, 88, 151, 107, 81, 142, 47, 59, 206, 104, 357, 205, 192, 144, 126, 186, 200, 108, 63, 165, 209, 164, 75, 97, 98, 306, 218, 170, 127, 177, 94, 79, 64, 219, 60, 198, 332, 116, 127, 114, 99, 137, 84, 118, 97, 44, 51, 247, 145, 137, 195, 132, 200, 185, 107, 117, 145, 78, 62, 132, 205, 78, 244, 160, 82, 180, 236, 179, 155, 280, 257, 206, 180, 248, 188], [89, 110, 199, 124, 212, 106, 156, 88, 140, 146, 107, 82, 126, 77, 106, 81, 129, 189, 162, 73, 78, 189, 73, 226, 154, 152, 66, 171, 154, 196, 176, 111, 119, 112, 115, 221, 113, 70, 155, 144, 119, 150, 131, 235, 209, 142, 227, 138, 82, 91, 118, 97, 50, 68, 76, 130, 94, 101, 82, 72, 80, 66, 102, 90, 109, 106, 82, 67, 66, 71, 97, 102, 197, 218, 65, 135, 146, 178, 251, 127, 162, 118, 135, 208, 94, 69, 276, 122, 140, 223, 180, 119, 101, 145, 109, 106, 242, 130, 103, 80, 112, 100, 150, 203, 191, 119, 77, 138, 203, 86, 84, 189], [101, 247, 135, 144, 796, 120, 125, 119, 227, 106, 275, 109, 119, 168, 230, 105, 255, 367, 196, 75, 50, 150, 229, 164, 365, 307, 169, 306, 125, 299, 246, 154, 145, 322, 209, 412, 243, 129, 165, 431, 305, 125, 45, 190, 170, 214, 162, 146, 61, 122, 125, 276, 229, 250, 191, 181, 99, 190, 126, 205, 131, 180, 164, 127, 262, 134, 311, 89, 96, 134, 190, 347, 323, 97, 94, 106, 106, 592], [40, 58, 57, 32, 46, 121, 62, 93, 66, 26, 66, 59, 97, 271, 34, 62, 100, 140, 129, 103, 190, 41, 193, 274, 76, 63, 382, 177, 107, 121, 47, 163, 255, 80, 106, 45, 98, 89, 61, 63, 173, 45, 66, 259, 104, 119, 110, 74, 71, 142, 164, 107, 108, 45, 66, 97, 53, 67, 60, 154, 104, 137, 131, 121, 75, 97, 105, 132, 74, 150, 225, 133, 64, 96, 149, 136, 122, 113, 85, 119, 56, 90, 106, 73, 63, 79, 109, 191, 82, 77, 270, 98, 89, 82, 81, 87, 85, 69, 112, 168, 115, 83, 109, 82, 77, 85, 113, 70, 160, 121, 108, 63, 78, 67, 103, 113, 202, 99], [196, 339, 347, 206, 102, 220, 111, 136, 107, 139, 304, 151, 152, 176, 183, 132, 96, 96, 194, 134, 400, 296, 163, 115, 133, 309, 176, 194, 179, 182, 852, 263, 644, 190, 511, 182, 247, 165, 267, 301, 271, 100, 395, 146, 241, 184, 156, 142, 69, 190, 216, 112, 226, 309, 530, 107, 138, 568, 211, 268, 749, 480, 375, 249], [122, 215, 210, 181, 121, 160, 164, 174, 103, 163, 108, 84, 117, 80, 153, 135, 213, 228, 233, 230, 243, 236, 119, 125, 123, 156, 145, 63, 119, 117, 131, 216, 136, 122, 106, 141, 184, 92, 122, 180, 129, 199, 124, 138, 215, 55, 159, 121, 121, 163, 69, 106, 182, 156, 162, 76, 123, 151, 251, 211, 109, 128, 164, 79, 114, 55, 120, 211, 101, 165, 99, 113, 124, 158, 153, 64, 177], [46, 80, 117, 112, 110, 105, 87, 89, 65, 88, 59, 61, 92, 77, 95, 104, 47, 122, 92, 66, 155, 98, 70, 113, 64, 67, 80, 93, 103, 65, 64, 72, 67, 86, 88, 95, 49, 70, 54, 77, 114, 80, 58, 115, 90, 48, 61, 32, 254, 61, 126, 93, 48, 50, 39, 42, 43, 43, 75, 31, 101, 67, 151, 51, 48, 26, 68, 65, 46, 63, 64, 50, 35, 54, 57, 30, 76, 44, 39, 40, 57, 77, 89, 65, 57, 53, 68, 54, 69, 58, 60, 87, 55, 87, 41, 41, 43, 73, 85, 34, 30, 81, 64, 65, 43, 70, 40, 33, 106, 33, 81, 55, 61, 45, 29, 82, 51, 100, 61, 47, 64, 65, 33, 67, 43, 33, 106, 67, 84, 52, 34, 68, 45, 23, 50, 85, 68, 39, 108, 65, 36, 72, 40, 33, 106, 57, 22, 66, 56, 33, 72, 50, 47, 84, 121, 74, 53, 94, 65, 58, 69, 43, 33, 106, 48, 100, 80, 70, 60, 37, 51, 33, 101, 64, 65, 57, 60, 40, 33, 106, 53, 37, 94, 64, 49, 79, 72, 46, 128, 64, 65, 77, 50, 60, 29, 101, 108, 55, 74, 81, 63, 66, 40, 48, 55, 69, 61, 57, 45, 57, 57, 54, 83, 43, 55, 74, 53, 51, 73, 46, 63, 47, 84, 50, 66, 38, 252], [105, 72, 128, 126, 116, 88, 185, 159, 63, 227, 115, 227, 110, 228, 165, 190, 123, 175, 297, 107, 107, 171, 121, 182, 228, 74, 82, 115, 74, 111, 87, 102, 126, 132, 94, 195, 203, 113, 158, 424, 141, 220, 122, 387, 156, 152, 143, 107, 240, 74, 96, 126, 65, 145, 101, 159, 100, 101, 168, 326, 249, 213, 243, 208, 130, 127, 119, 108, 108, 74, 93, 82, 86, 80, 98, 94, 60, 108, 68, 145, 181, 202, 165, 194, 120, 164, 215, 210, 136, 192, 202, 154, 184], [46, 63, 115, 240, 127, 143, 232, 191, 196, 220, 125, 210, 180, 200, 381, 136, 125, 241, 258, 213, 129, 116, 328, 154, 293, 131, 284, 164, 292, 179, 221, 323, 84, 154, 228, 179, 194, 283, 124, 168, 102, 144, 183, 142, 232, 276, 269, 325, 146, 261, 109, 96, 195, 160, 159, 137, 251, 234, 236, 191, 244, 105, 238, 213, 91, 118, 164, 156, 70, 191, 183, 197, 176, 128, 201, 298, 290, 335, 203, 220, 161, 327, 173, 202, 230, 161, 306, 195], [44, 96, 170, 96, 140, 123, 216, 251, 134, 347, 141, 175, 174, 207, 114, 130, 259, 144, 94, 175, 93, 133, 183, 183, 276, 149, 265, 150, 236, 93, 222, 217, 275, 134, 108, 225, 113, 240, 210, 399, 198, 105, 114, 133, 326, 346, 297, 180, 226, 132, 167, 221, 210, 100, 147, 87, 69, 227, 66, 143, 182, 153, 221, 150, 184, 123, 216, 206, 140], [44, 32, 87, 190, 94, 118, 125, 288, 350, 150, 92, 113, 138, 100, 137, 176, 133, 183, 173, 141, 218, 167, 153, 229, 183, 88, 243, 299, 158, 299, 159, 149, 209, 121, 101, 170, 144, 165, 246, 280, 242, 151, 194, 176, 139, 229, 248, 274, 88, 209, 165, 145, 180, 228, 195, 197, 186, 225, 107, 152], [44, 37, 44, 106, 78, 222, 178, 95, 96, 282, 162, 247, 179, 233, 324, 242, 250, 141, 125, 391, 219, 325, 191, 98, 170, 120, 216, 132, 286, 163, 170, 291, 286, 273], [44, 108, 192, 261, 179, 88, 94, 77, 178, 158, 112, 248, 175, 173, 185, 151, 103, 99, 136, 245, 167, 202, 183, 169, 115, 173, 182, 87, 133, 64], [137, 109, 79, 339, 342, 404, 193, 168, 229, 177, 72, 139, 283, 193, 135, 184, 191, 176, 365, 284, 167, 234, 290, 204, 215, 203, 159, 175, 155, 152, 187, 232, 329, 218, 684, 236, 710, 224, 134, 158, 61, 53, 201, 129, 93, 129, 110, 166, 245, 779, 441, 244, 689, 87, 279, 217, 153, 127, 286, 252, 87, 128, 138, 79, 76, 141, 118, 72, 155, 78, 182, 237, 273], [184, 177, 314, 143, 136, 183, 196, 172, 294, 160, 151, 420, 214, 293, 236, 218, 135, 207, 259, 120, 228, 262, 279, 166, 106, 147, 156, 137, 81, 112, 353, 175, 397, 153, 88, 111, 289, 121, 213, 122, 154, 212, 350, 121, 189, 260, 131, 119, 116, 174, 130, 148, 173, 179], [235, 178, 211, 116, 143, 144, 163, 294, 188, 322, 332, 334, 357, 270, 105, 66, 35, 411, 62, 55, 44, 151, 67, 153, 160, 85, 204, 206, 202, 146, 214, 295, 165, 153, 134, 220, 341, 128, 291, 339, 204, 233, 322, 248, 251], [41, 39, 48, 34, 67, 105, 85, 108, 114, 95, 173, 251, 123, 150, 135, 70, 53, 158, 166, 108, 84, 97, 172, 45, 57, 90, 74, 103, 81, 91, 102, 62, 115, 108, 107, 148, 101, 120, 116, 128, 83, 67, 127, 68, 184, 115, 235, 78, 100, 91, 103, 185, 87, 117, 79, 75, 77, 66, 93, 120, 84, 86, 44, 61, 168, 139, 194, 99, 127, 134, 130, 90, 102, 91, 112, 102, 121, 144, 113, 92, 140, 77, 114], [38, 40, 55, 35, 116, 67, 54, 95, 50, 111, 176, 57, 45, 57, 44, 81, 28, 61, 82, 57, 75, 115, 61, 44, 76, 41, 57, 132, 58, 92, 109, 53, 57, 68, 113, 72, 128, 61, 94, 58, 42, 42, 27, 33, 60, 44, 90, 105, 53, 58, 74, 74, 99, 39, 54, 53, 94, 50, 66, 36, 49, 66, 69, 61, 60, 62, 92, 55, 45, 50, 60, 52, 63, 61, 77, 63, 59, 72, 59, 46, 45, 45, 64, 89, 76, 57, 65, 40, 81, 50, 78, 51, 59, 57, 57, 44, 88, 76, 80, 46, 54, 291, 117, 32, 86, 34, 48, 75, 30, 47, 41, 75, 120, 58, 61, 50, 44, 37, 76, 40, 47, 44, 47, 53, 75, 61, 81, 43, 75, 31, 65, 41, 43, 45, 63, 66, 41, 39, 45, 48, 47, 65, 46, 79, 58, 53, 62, 65, 88, 65, 60, 69, 42, 46, 30, 34, 50, 161, 58, 88, 52, 52, 52, 73, 66, 58, 37, 73, 69, 105, 72, 42, 52, 45, 60, 42, 110, 41, 48, 86, 29, 65], [81, 58, 118, 147, 79, 147, 98, 159, 99, 140, 90, 123, 100, 80, 143, 100, 148, 132, 81, 93, 115, 240, 146, 397, 105, 316, 182, 217, 159, 109, 113, 157, 101, 147, 140, 87, 71, 36, 92, 76, 136, 115, 133, 203, 114, 144, 63, 88, 101, 123, 92, 92, 69, 66, 110, 68, 81, 51, 108, 157, 98, 97, 83, 75, 115, 112, 35, 25, 102, 67, 87, 113, 51, 66, 180, 92, 70, 57, 81, 50, 35, 67, 69, 61, 89, 109, 53, 63], [79, 148, 321, 187, 275, 413, 361, 358, 332, 264, 125, 86, 88, 97, 188, 147, 155, 232, 138, 209, 327, 232, 390, 212, 100, 122, 110, 115, 250, 63, 82, 205, 140, 104, 131, 172, 122, 382, 104, 86, 254, 273, 127, 157, 293, 184, 293, 122, 235, 87, 224, 141, 192, 144, 162, 191, 108, 139, 144, 166, 126, 96, 149, 92, 223, 60, 257, 217, 243, 98, 397, 119, 255, 214, 256], [41, 79, 163, 188, 306, 115, 350, 226, 211, 236, 205, 212, 202, 175, 219, 176, 127, 250, 77, 158, 268, 183, 88, 80, 192, 181, 135, 458, 261, 120, 140, 90, 143, 308, 280, 83, 297, 129, 138, 251, 90, 172, 242, 124, 131, 185, 188, 115, 120, 221, 167, 158, 117, 48, 249, 329, 119, 170, 87, 198, 183, 140, 88, 267, 233, 220, 374, 106, 137, 163, 87, 63, 92, 166, 145, 91, 219, 387, 93, 174, 99, 247, 190, 135, 220], [41, 64, 88, 190, 207, 254, 71, 125, 154, 240, 187, 271, 156, 249, 252, 229, 225, 70, 124, 134, 213, 178, 141, 152, 372, 131, 141, 181, 170, 244, 179, 59, 164, 222, 163, 149, 184, 151, 260, 273, 157, 120, 175, 423, 276, 161, 359, 129, 125, 408, 147, 157, 211, 140], [7, 47, 109, 103, 218, 224, 312, 174, 187, 176, 231, 156, 480, 402, 563, 199, 152, 196, 120, 217, 273, 348, 373, 253, 99, 187, 231, 153, 229, 118, 127, 69, 163, 93, 139, 219, 105, 209, 82, 191, 110, 152, 112, 205, 359, 129, 226, 358, 172, 119, 221, 296, 141], [41, 38, 89, 99, 107, 59, 68, 111, 153, 130, 147, 97, 226, 46, 138, 89, 173, 123, 173, 168, 78, 113, 206, 183, 86, 113, 73, 135, 158, 106, 100, 314, 244, 84, 168, 159, 107, 189, 132, 103, 84, 102, 89, 124, 137, 188, 87, 164, 135, 94, 171, 116, 100, 131, 76, 80, 123, 163, 129, 115, 231, 88, 191, 108, 149, 94, 78, 102, 111, 53, 180, 94, 70, 88, 104, 75, 108, 92, 71, 146, 149, 119, 110, 126, 184, 169, 118, 101, 75], [40, 36, 152, 55, 86, 65, 94, 130, 31, 77, 49, 83, 126, 91, 88, 89, 105, 102, 87, 87, 59, 114, 83, 80, 58, 36, 55, 80, 78, 73, 101, 83, 59, 40, 69, 58, 137, 82, 118, 81, 92, 87, 26, 28, 44, 34, 76, 54, 67, 40, 63, 25, 64, 81, 66, 125, 62, 85, 57], [40, 77, 65, 132, 280, 158, 29, 141, 114, 196, 152, 156, 157, 202, 154, 204, 287, 202, 194, 104, 213, 151, 272, 175, 148, 176, 176, 158, 110, 151, 166, 221, 125, 153, 231, 121, 101], [41, 77, 183, 276, 173, 135, 136, 282, 210, 296, 256, 196, 200, 101, 569, 201, 363, 163, 167, 352, 265, 144, 165, 220, 184, 403, 190, 230, 247, 168, 198, 184, 177, 221, 395], [131, 210, 168, 611, 46, 93, 97, 109, 101, 177, 129, 236, 138, 156, 474, 254, 107, 212, 217, 340, 151, 115, 92, 91, 165, 145, 100, 130, 108, 183, 162, 238, 91, 139, 156, 179, 118, 360], [55, 135, 47, 236, 220, 298, 103, 88, 152, 301, 373, 214, 122, 162, 305, 308, 305, 234, 85, 233, 153, 145, 125, 182, 581, 357, 332, 160, 754], [139, 202, 170, 91, 134, 180, 346, 73, 360, 143, 445, 288, 293, 290, 201, 156, 222, 100], [74, 131, 96, 100, 105, 108, 137, 98, 118, 60, 115, 109, 48, 128, 99, 132, 133, 81, 94, 91, 88, 128, 73, 105, 53, 82, 124, 94, 86, 96, 73, 180, 134, 62, 88, 195, 104, 115, 156, 146, 73, 115, 74, 121, 135], [38, 47, 43, 63, 77, 46, 32, 47, 84, 25, 62, 47, 63, 73, 76, 100, 65, 68, 118, 56, 46, 68, 127, 84, 130, 81, 53, 146, 98, 76, 68, 77, 47, 88, 53, 79, 85, 90, 90, 83, 78, 83, 87, 120, 68, 96, 91, 71, 74, 89, 136, 107, 121, 74, 72, 68, 103, 77, 157, 108], [17, 24, 22, 59, 34, 50, 52, 28, 57, 48, 41, 39, 88, 48, 39, 141, 66, 120, 76, 130, 217, 70, 130, 101, 56, 84, 87, 109, 125, 75, 59, 119, 73, 75, 69, 76, 98, 138, 43, 104, 62, 110, 102, 103, 96, 93, 132, 154, 78], [34, 58, 41, 41, 50, 78, 54, 40, 56, 76, 60, 77, 60, 56, 31, 55, 83, 62, 48, 45, 47, 40, 249, 41, 66, 159, 77, 118, 110, 149, 211, 352, 44, 39, 53, 67, 65, 65, 59, 42, 57, 45, 61, 49, 51, 49, 59, 59, 60, 59, 46, 118, 62, 51, 60, 64, 37, 50, 38, 30, 44, 54], [99, 73, 151, 93, 64, 94, 95, 86, 135, 66, 59, 107, 63, 74, 85, 48, 111, 79, 83, 69, 49, 111, 36, 126, 98, 61, 101, 115, 72, 49, 117, 112, 40, 131, 63, 81, 134, 58, 37, 112, 75, 128, 142, 61, 74, 119, 85, 105, 89, 59, 95, 58, 79, 68, 85], [22, 33, 14, 33, 76, 50, 64, 47, 69, 48, 68, 65, 59, 54, 52, 59, 97, 59, 64, 57, 59, 38, 59, 72, 59, 37, 75, 59, 133, 59, 50, 59, 172, 59, 111, 59, 73, 59, 94, 59, 119, 59, 52, 70, 59, 162, 59, 31, 59, 46, 59, 48, 59, 116, 59, 121, 59, 33, 59, 44, 59, 59, 59, 30, 59, 58, 59, 57, 59, 48, 59, 51, 59, 58, 59, 55, 59, 67], [40, 48, 48, 45, 43, 35, 45, 120, 111, 97, 38, 27, 54, 45, 53, 34, 51, 66, 73, 34, 45, 72, 31, 37, 75, 40, 70, 46, 55, 21, 25, 24, 52, 35, 59, 28, 40, 35, 54, 56, 69, 54, 28, 40, 57, 72, 99, 27, 61, 74, 64, 40, 38, 39, 51, 55, 51, 45, 63, 64, 77, 100, 43, 50, 88, 95, 35, 35, 75, 86, 36, 62, 105, 57, 58, 56, 44, 40, 52, 60, 56, 81, 72, 35, 77, 68, 53, 60, 66, 50, 95, 80, 47, 24, 44, 55], [105, 120, 132, 328, 95, 168, 184, 181, 196, 411, 143, 275, 325, 315, 184, 389, 150, 194, 338, 529, 297, 156, 160, 171, 398, 191, 520, 274, 236], [244, 294, 277, 338, 228, 197, 454, 484, 228, 207, 356, 259, 281, 198, 83, 144, 143, 197, 179, 90, 120, 567], [118, 496, 174, 127, 191, 233, 432, 246, 391, 244, 332, 217, 167, 252, 162, 211, 150, 173, 150, 134, 201, 151, 281, 203], [629, 183, 153, 586, 136, 219, 169, 203, 264, 734, 254, 528, 244], [118, 55, 71, 105, 294, 332, 165, 170, 209, 95, 177, 182, 150, 384], [139, 277, 133, 104, 365, 156, 151, 192, 234, 173, 255], [217, 134, 115, 312, 181, 174, 215, 254, 145, 283, 113], [171, 130, 132, 149, 155, 251, 218, 137, 364, 184, 211, 135, 101, 234, 95, 211, 160, 63], [545, 395, 224, 400, 160, 443, 250, 196, 115, 172, 417, 244], [157, 157, 329, 311, 266, 256, 131, 485, 151, 317, 254, 296], [76, 125, 167, 104, 188, 105, 98, 117, 151, 124, 89, 112, 105, 104, 168, 135, 163, 93, 186, 125, 143, 115, 129, 97, 82, 93, 190, 164, 152, 123], [90, 61, 50, 58, 34, 39, 125, 81, 90, 56, 42, 54, 49, 47, 76, 36, 130, 39, 102, 73, 52, 68, 53, 69, 88, 65, 48, 90, 66, 50, 62, 133, 107, 89, 73, 43, 42, 43, 115, 55, 92, 135, 154, 128, 56, 84, 84, 146, 137, 59, 150, 65], [27, 24, 53, 63, 66, 66, 180, 36, 96, 95, 113, 112, 52, 86, 47, 73, 108, 86, 92, 57, 35, 20, 50, 95, 114, 44, 43, 31, 39, 49, 32, 65, 56, 49, 41, 56, 48, 31, 24, 79, 55, 68, 68, 63, 55, 54, 54, 58, 75, 74, 49, 45], [50, 48, 46, 103, 53, 40, 25, 63, 38, 39, 213, 27, 34, 57, 43, 37, 217, 50, 41, 36, 39, 33, 43, 47, 81, 49, 50, 72, 51, 112, 61, 50, 45, 49, 48, 115, 58, 60, 71, 104, 76, 109, 99, 109], [114, 57, 55, 158, 90, 61, 213, 34, 69, 74, 46, 101, 108, 73, 67, 73, 74, 91, 56, 45, 129, 38, 120, 118, 135, 83, 117, 190], [153, 117, 91, 105, 79, 128, 91, 98, 136, 125, 104, 117, 177, 208, 71, 135, 155, 82, 154, 88, 79, 121, 188, 157, 123, 90, 136, 205], [38, 44, 36, 72, 58, 139, 64, 86, 131, 78, 141, 59, 45, 128, 121, 85, 111, 77, 85, 902], [39, 19, 26, 28, 28, 67, 51, 41, 36, 34, 76, 40, 29, 47, 44, 73, 65, 31, 38, 42, 20, 36, 35, 58, 42, 31, 47, 60, 26, 37, 682, 20, 34, 35, 72, 21, 75, 49, 51, 55, 45, 34, 57, 38, 64, 41, 45, 63, 84, 35, 30, 132, 48, 37, 48, 158], [36, 64, 55, 68, 61, 45, 31, 28, 65, 52, 25, 56, 95, 67, 44, 78, 77, 88, 49, 73, 28, 52, 25, 56, 67, 63, 53, 67, 41, 47, 67, 62, 53, 37, 43, 87, 56, 90, 46, 69], [87, 121, 71, 79, 98, 96, 86, 94, 97, 85, 100, 96, 139, 106, 86, 89, 79, 38, 124, 89, 167, 91, 72, 146, 81, 106, 97, 139, 88, 83, 114], [59, 38, 39, 48, 43, 33, 46, 33, 32, 43, 54, 36, 43, 58, 43, 39, 47, 50, 43, 52, 44, 40, 68, 43, 44, 25, 96, 43, 70, 60, 69, 60, 56, 43, 52, 50, 43, 81, 48, 43, 69, 38, 67, 44, 43, 112, 43, 78, 43, 57], [35, 62, 35, 30, 37, 40, 26, 50, 37, 41, 36, 50, 40, 54, 50, 29, 47, 74, 54, 70, 34, 88, 36, 52, 50, 36, 50, 80, 42, 88, 58, 25, 43, 22, 56, 71, 151, 174, 107, 182], [69, 52, 55, 53, 68, 88, 52, 40, 25, 76, 37, 53, 61, 65, 41, 57, 70, 74, 58, 44, 42, 48, 46, 35, 137, 66, 78, 56, 73, 43, 51, 35, 49, 64, 54, 62, 63, 51, 35, 115, 35, 73, 52, 42, 53, 117], [43, 95, 80, 66, 45, 22, 91, 47, 31, 38, 65, 42, 46, 30, 36, 23, 45, 35, 75, 35, 54, 51, 54, 39, 38, 41, 32, 39, 23, 36, 25, 50, 58, 44, 32, 32, 76, 49, 32, 48, 25, 85], [54, 35, 40, 52, 52, 47, 47, 65, 28, 50, 46, 43, 36, 57, 64, 40, 31, 36, 91, 68, 51, 55, 71, 66, 60, 21, 63, 52, 83], [29, 36, 40, 56, 81, 66, 67, 49, 52, 59, 40, 30, 51, 64, 60, 58, 57, 59, 135], [54, 69, 71, 53, 16, 77, 81, 43, 39, 68, 34, 80, 75, 81, 70, 54, 69, 83, 45, 39, 53, 55, 43, 61, 50, 102, 37, 52, 71, 71, 68, 76, 61, 69, 46, 67], [30, 58, 36, 55, 72, 123, 56, 43, 38, 49, 31, 41, 48, 57, 49, 39, 40, 35, 58, 56, 65, 80, 63, 40, 100], [37, 37, 72, 50, 35, 32, 73, 108, 98, 203, 140, 59, 99, 67, 30, 34, 42, 28, 76, 70, 29, 40], [47, 56, 34, 83, 42, 36, 49, 49, 62, 42, 47, 64, 83, 30, 52, 27, 71], [44, 46, 91, 38, 35, 82, 76, 69, 56, 49, 42, 46, 48, 68, 87, 38, 47, 44, 39], [67, 67, 59, 42, 51, 59, 48, 40, 64, 20, 47, 31, 40, 21, 23, 30, 53, 35, 48, 38, 63, 36, 41, 52, 31, 42], [14, 38, 43, 34, 100, 68, 38, 50, 71, 54, 56, 36, 61, 43, 120, 98, 73, 50, 46, 37, 45, 49, 119, 77, 62, 50, 75, 69, 38, 24], [29, 67, 56, 42, 42, 53, 34, 37, 29, 34, 53, 58, 30, 40, 32, 36, 135, 46, 105, 63], [34, 36, 44, 37, 42, 37, 61, 64, 81, 97, 109, 60, 134, 172, 45], [31, 36, 44, 51, 52, 34, 45, 62, 38, 44, 62, 38, 63, 53, 52, 34, 61, 57, 79, 66, 45], [29, 42, 73, 67, 77, 66, 62, 62, 45, 36, 58], [53, 33, 29, 38, 45, 71, 85, 53], [24, 19, 32, 50, 46, 101, 71, 33], [60, 51, 41, 49, 34, 50, 44, 37, 46, 36, 52, 21, 60, 38, 66, 24, 46, 47, 83], [64, 58, 94, 88, 64], [171, 83, 43, 129, 212, 194, 124, 214], [52, 42, 46, 54, 39, 93, 66, 67], [39, 36, 32, 37, 53, 43, 44, 43, 84, 55, 94], [37, 31, 60, 59, 44, 58, 41, 51, 39, 40, 28], [71, 34, 31, 30, 79, 36, 50, 70], [23, 23, 250], [39, 41, 51, 57, 52, 43, 36, 41, 42], [130, 42, 40, 37, 75], [63, 103, 50, 81], [46, 51, 47, 36, 44, 41, 49], [65, 55, 79], [89, 35, 41, 54, 42, 51], [70, 67, 116], [59, 54, 48, 80, 50], [42, 50, 33, 38], [48, 36, 68, 52, 51], [50, 24, 24, 91, 45, 24]]

// Creating line to [chapter,verseNo] mappings
// Array containing number of verses in each chapters
var chaplength = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6]
// contains chapter verse mappings for each line
const mappings = []
const mappingsStr = []

for (var i = 1; i <= 114; i++) {
  for (var j = 1; j <= chaplength[i - 1]; j++) {
    mappings.push([i, j])
    mappingsStr.push(i + ',' + j)
  }
}

const tempPatternArr = confirmPattern.map(e => e.source).concat(arabicQuranName.map(e => e[0].source))
// This stores the pattern to clean verse patterns etc from string
var cleanStrPattern = new RegExp('(' + tempPatternArr.reduce((full, val) => full + '|' + val) + ')')

// I could use ignorePatterns to more narrow down the search, I could also include date, time etc to remove
// var ignorePatterns = ignoreBiblePattern.concat(ignoreQuranPattern)
// Patterns that confirms the verse pattern
const goodPatterns = confirmPattern.concat(arabicQuranName.map(e => e[0]), englishQuranName.map(e => e[0]))

var arabicEnglishQuranName = arabicQuranName.concat(englishQuranName)
