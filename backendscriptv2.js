const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')
const { firefox } = require('playwright')
const { JSDOM } = require('jsdom')
const { window } = new JSDOM('')
const $ = require('jquery')(window)
const difflib = require('difflib')
// Requires for python or other system binaries to launch
const { spawnSync } = require('child_process')

// Link having questions searched by user
const dbJSONLink = 'https://docs.google.com/spreadsheets/d/1THkt6fNsxKPQ2aE1GDnlzWzT9dt_CHmMijjScUw9z0s/gviz/tq?tqx=out:json'

// To allow going to any context
let context
// Allows closing of browser from anywhere
let browser

const pageTimeOut = 120000

// Number of verses in quran
// const VERSE_LENGTH = 6236

// No of chapters in quran
const CHAPTER_LENGTH = 114

// stores the translations
let translationsArr = []

const gestaltThreshold = 0.60

// Array containig lunrIndex for each verse
// let lunrIndexArr = []

const googleSearchLink = 'https://www.google.com/search?&q='

const apiLink = 'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1'
const editionsLink = apiLink + '/editions'
// Eigthy questions to search at a time to avoid 6 hours actions time limit
const noOfQues = 50

// Read the already inferred question & it's verses
const questionVersesPath = path.join(__dirname, 'questionverses.min.json')
const questionVersesStr = fs.readFileSync(questionVersesPath).toString()
const questionVerses = JSON.parse(questionVersesStr)

// const googleCodesLink = apiLink + '/isocodes/google-codes.min.json'

//  english translation editions to use in lunr
const editionNames = ['eng-ummmuhammad', 'eng-abdullahyusufal', 'eng-muhammadtaqiudd', 'eng-mohammedmarmadu', 'eng-maududi', 'eng-safikaskas', 'eng-wahiduddinkhan', 'eng-ajarberry']
// Contains english translation links to use in lunr
const translationLinks = editionNames.map(e => editionsLink + '/' + e + '.min.json')

// numberpattern that match numbers less than 300 and with negative lookbehind and negative lookahead digits
//  i.e no digit front and end of match
const numberPattern = /(?<!\d)[0-2]?\d{1,2}(?!\d)/gi

// Returns array of questions searched by user
async function getDBArray () {
  const dbText = await fetch(dbJSONLink).then(response => response.text()).catch(console.error)
  const dbJSON = JSON.parse(dbText.match(/(?<=.*\().*(?=\);)/s)[0])
  const column = 1
  return dbJSON.table.rows.map(e => e.c[column].v)
}

// Cleans the searched questions retrieved from google forms from already added question in questionVerses json
// To avoid doing inference for questions which were already inferred in questionVerses json
// Doesn't return complete array, only first 80 elems of cleanArr
async function getCleanDBArray () {
  const searchArr = await getDBArray()
  const fullQuestionsArr = questionVerses.values.map(e => e.questions).flat().map(e => e.toLowerCase())
  const cleanArr = searchArr.filter(e => !fullQuestionsArr.includes(e.toLowerCase()))
  return [...new Set(cleanArr.map(e => e.trim()))].slice(0, noOfQues)
}

// Fetches the translationLinks and returns the translations in optimized array form
// Also assigns it to global translationsArr
async function getTranslations (linksarr) {
  const transJSON = await getLinksJSON(linksarr)
  translationsArr = transJSON.map(e => e.quran.map(e => e.text)).map(e => qArrayOptimzer(e))
  return translationsArr
}
// https://www.shawntabrizi.com/code/programmatically-fetch-multiple-apis-parallel-using-async-await-javascript/
// Get links async i.e in parallel
async function getLinksJSON (urls) {
  return await Promise.all(
    urls.map(url => fetch(url).then(response => response.json()))
  ).catch(console.error)
}

// Takes links array to be fetched and returns merged html of all links
// Usually getGoogleLinks() result is passed in here
async function linksFetcher (linksarr) {
  let val = await Promise.allSettled(linksarr.map(e => linkFetcher(e)))
  val = val.map(e => e.value ? e.value : '')
  return val.reduce((full, curr) => full + curr)
}

async function linkFetcher (link) {
  const page = await context.newPage()
  await page.goto(link, { timeout: pageTimeOut })
  return await page.evaluate(() => {
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
}

// context and browser is a global variable and it can be accessed from anywhere
// function that launches a browser
async function launchBrowser () {
  browser = await firefox.launch({
    headless: true
  })
  context = await browser.newContext()
}

async function getGoogleLinks (query) {
  // This should be kept somewhere else
  const page = await context.newPage()
  await page.goto(googleSearchLink + encodeURIComponent(query), {
    timeout: pageTimeOut
  })

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
  let str = $.parseHTML(htmlString).reduce((full, val) => full + ' ' + val.textContent)
  // removing css,html,links,ISBN,17+ character length,multiple spaces from str to narrow down the search
  str = str.replace(/<([A-Z][A-Z0-9]*)\b[^>]*>(.*?)<\/\1>/gi, ' ').replace(/<([A-Z][A-Z0-9]*)>.*?<\/\1>/gi, ' ').replace(/<([A-Z][A-Z0-9]*)\b[^>]*\/?>(.*?)/gi, ' ').replace(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi, ' ').replace(/(.|@).+?\{[^\}]+\:[^\}]+\}/gi, ' ').replace(/[^\s]{17,}/gi, ' ').replace(/\d{4,}/gi, ' ').replace(/\s\s+/g, ' ')

  return str
}

// Begins inference
async function inference () {
  // Get clean questions array, with duplicates removed

  // Get all the translations
  const [cleanSearchArr] = await Promise.all([getCleanDBArray(), getTranslations(translationLinks)])

  for (const query of cleanSearchArr) {
    try {
    // Launch the browser
      await launchBrowser()

      // Stores the links we got from google search
      const linksarr = await getGoogleLinks(query + ' in quran')
      // stores the  html string for all the links we got from previous google search step
      const htmlStr = await linksFetcher(linksarr)
      // stores the parsed html string
      const parsedStr = htmlToString(htmlStr)
      // Close the browsers to save resources , so gestalt can get more resources
      await browser.close()

      let confirmedVerses = await gestaltInference(parsedStr)
      // Remove duplicates
      confirmedVerses = [...new Set(confirmedVerses)]
      let translatedQueryArr = translateQuery(query).concat(query)

      // Remove duplicates
      translatedQueryArr = [...new Set(translatedQueryArr.map(e => e.trim()))]
      // save the query & confirmed verses in JSON
      saveQuestionVerses(translatedQueryArr, confirmedVerses)
    } catch (error) {
      console.log('Seems like there was a problem during this query: \n', query)
      // Close the browsers ,just in case it wasn't closed above
      await browser.close()
      console.error(error)
    }
  }
}

// Call inference, main function
inference()

// optimizes a flat array of 6236 length to optimized array
// which can be accessed by arr[chap-1][verse-1]
function qArrayOptimzer (arr) {
  // Temporarily stores the optimzed array
  const tempArr = []
  let counter = 0
  for (let i = 1; i <= 114; i++) {
    if (!tempArr[i - 1]) { tempArr[i - 1] = [] }
    for (let j = 1; j <= chaplength[i - 1]; j++) {
      tempArr[i - 1][j - 1] = arr[counter++]
    }
  }
  return tempArr
}

async function gestaltInference (parsedString) {
  const numbers = Array.from(parsedString.matchAll(numberPattern)).filter(e => e[0] > 0 && e[0] <= 286)
  let fullConfirmedArr = []

  for (let i = 0; i < numbers.length; i++) {
    const twoNum = numbers[i + 1] && numbers[i + 1].index - 40 < numbers[i].index
    const threeNum = numbers[i + 1] && numbers[i + 2] && numbers[i + 1].index - 40 < numbers[i].index && numbers[i + 2].index - 40 < numbers[i].index
    // I can remove this pattern checks, to make sure I catch all verses
    // can try later commenting it

    // assuming Chapter Number pattern (with no ayah, i.e full chapter) Eg: Chapter 110
    fullConfirmedArr = fullConfirmedArr.concat(getGestaltMultiArr(numbers[i][0], 1, chaplength[numbers[i][0] - 1], numbers[i].index, parsedString, fullConfirmedArr))
    fullConfirmedArr = fullConfirmedArr.concat(getGestaltMultiArr(numbers[i][0], 1, chaplength[numbers[i][0] - 1], numbers[i].index, parsedString, fullConfirmedArr, true))

    // if number exists next to this number i.e within 40 chars
    // assuming chapter verse pattern and verse chapter pattern
    if (twoNum) {
      // assuming chapter verse pattern
      fullConfirmedArr = fullConfirmedArr.concat(getGestaltArr(numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, fullConfirmedArr))
      fullConfirmedArr = fullConfirmedArr.concat(getGestaltArr(numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, fullConfirmedArr, true))
      // assuming verse ,chapter pattern
      fullConfirmedArr = fullConfirmedArr.concat(getGestaltArr(numbers[i + 1][0], numbers[i][0], numbers[i].index, parsedString, fullConfirmedArr))
      fullConfirmedArr = fullConfirmedArr.concat(getGestaltArr(numbers[i + 1][0], numbers[i][0], numbers[i].index, parsedString, fullConfirmedArr, true))
    }
    for (const patt of arabicEnglishQuranName) {
      const chapNameExists = new RegExp(patt[0]).test(parsedString.substring(numbers[i].index - 40, numbers[i].index + 40))
      const chapter = chapNameExists ? patt[1] : undefined

      if (chapNameExists) {
        // assuming chapter name , verse pattern
        fullConfirmedArr = fullConfirmedArr.concat(getGestaltArr(chapter, numbers[i][0], numbers[i].index, parsedString, fullConfirmedArr))
        fullConfirmedArr = fullConfirmedArr.concat(getGestaltArr(chapter, numbers[i][0], numbers[i].index, parsedString, fullConfirmedArr, true))
      }
      // assuming chapter name, multi verse pattern
      if (chapNameExists && twoNum) {
        // chapter Name, verse1 to verse2 pattern
        fullConfirmedArr = fullConfirmedArr.concat(getGestaltMultiArr(chapter, numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, fullConfirmedArr))
        fullConfirmedArr = fullConfirmedArr.concat(getGestaltMultiArr(chapter, numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, fullConfirmedArr, true))
        //  verse1 to verse2, chapter Name pattern
        fullConfirmedArr = fullConfirmedArr.concat(getGestaltMultiArr(chapter, numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, fullConfirmedArr))
        fullConfirmedArr = fullConfirmedArr.concat(getGestaltMultiArr(chapter, numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, fullConfirmedArr, true))
      }
    }
    // assuming chapter number multi verse
    if (threeNum) {
      // chapter Number, verse1 to verse2 pattern
      fullConfirmedArr = fullConfirmedArr.concat(getGestaltMultiArr(numbers[i][0], numbers[i + 1][0], numbers[i + 2][0], numbers[i].index, parsedString, fullConfirmedArr))
      fullConfirmedArr = fullConfirmedArr.concat(getGestaltMultiArr(numbers[i][0], numbers[i + 1][0], numbers[i + 2][0], numbers[i].index, parsedString, fullConfirmedArr, true))

      //  verse1 to verse2, chapter Number pattern
      fullConfirmedArr = fullConfirmedArr.concat(getGestaltMultiArr(numbers[i + 2][0], numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, fullConfirmedArr))
      fullConfirmedArr = fullConfirmedArr.concat(getGestaltMultiArr(numbers[i + 2][0], numbers[i][0], numbers[i + 1][0], numbers[i].index, parsedString, fullConfirmedArr, true))
    }
  }
  return fullConfirmedArr
}

// Returns gestalt ratio between two given string
function getGestaltRatio (str1, str2) {
  return new difflib.SequenceMatcher(null, str1, str2).ratio()
}

// Returns gestalt ratio between two given string is above a given threshold or not
function checkGestaltRatio (str1, str2) {
  return getGestaltRatio(str1, str2) > gestaltThreshold
}

// Takes chapterNo  VerseNo and content and compares both of them
// Returns verse in an array if the ratio is more than a given threshold
// confirmedArr has to be cleaned for each new question query search to avoid bugs
function getGestaltArr (chapter, verse, index, parsedString, confirmedArr, front) {
  // Parsing the strings to int ,as in case of comparsion like "17">"2"-> false as both are string
  // Avoiding bugs like above
  chapter = parseInt(chapter)
  verse = parseInt(verse)
  index = parseInt(index)
  let content

  // return with empty array if chap verse doesn't exist or chap verse already exists in confirmedArr
  if (chapter > CHAPTER_LENGTH || !translationsArr[0][chapter - 1][verse - 1]) { return [] }
  // return the same chapter & verse if they already exists, help to pass for multiVerse checks
  if (confirmedArr.includes(chapter + ',' + verse)) { return [chapter + ',' + verse] }

  for (const translation of translationsArr) {
    const verseStr = translation[chapter - 1][verse - 1]
    // verselength
    const verseLen = verseStr.length
    if (front) {
      content = parsedString.substring(index, index + verseLen)
    //  content = cleanPatterns(content, true)
    } else {
      content = parsedString.substring(index - verseLen, index)
    //  content = cleanPatterns(content)
    }
    if (checkGestaltRatio(verseStr, content)) {
      return [chapter + ',' + verse]
    }
  }

  return []
}

function getGestaltMultiArr (chapter, verseFrom, verseTo, index, parsedString, confirmedArr, front) {
  // Parsing the strings to int ,as in case of comparsion like "17">"2"-> false as both are string
  // Avoiding bugs like above
  chapter = parseInt(chapter)
  verseFrom = parseInt(verseFrom)
  verseTo = parseInt(verseTo)
  index = parseInt(index)

  if (chapter > CHAPTER_LENGTH || !translationsArr[0][chapter - 1][verseTo - 1] || verseFrom >= verseTo ||
    // return if the multiverse is huge is size
    translationsArr[0][chapter - 1].slice(verseFrom - 1, verseTo).map(e => e.length).reduce((full, e) => full + e) > 1500) { return [] }

  // stores the chapter,verse
  let subConfirmedArr = []
  let backIndex = index
  let frontIndex = index

  for (let i = verseFrom; i <= verseTo; i++) {
    if (front) {
      subConfirmedArr = subConfirmedArr.concat(getGestaltArr(chapter, i, frontIndex, parsedString, confirmedArr, true))
      frontIndex = frontIndex + translationsArr[0][chapter - 1][i - 1].length
    } else {
      subConfirmedArr = subConfirmedArr.concat(getGestaltArr(chapter, i, backIndex, parsedString, confirmedArr))
      backIndex = backIndex - translationsArr[0][chapter - 1][i - 1].length
    }
    // Pass all the multiVerse, if atleast 1 passes in back pattern
    // or if other than first verse passes in front pattern
    // and combined verse length should be less than 600

    if (((subConfirmedArr.length > 0 && !front) || (front && subConfirmedArr.filter(e => e !== chapter + ',' + verseFrom).length > 0)) &&
       translationsArr[0][chapter - 1].slice(verseFrom - 1, verseTo).map(e => e.length).reduce((full, e) => full + e) < 600
    ) { return getFromToArr(verseFrom, verseTo).map(e => chapter + ',' + e) }
  }
  return subConfirmedArr
}
/*
// Remove the numbers, patterns such as 3:4 ,etc from the given string
// And return the cleaned one
// Also remove  alphanumeric chars, removing all punctuations , double whitespaces
// Don't remove englishquranname patterns

function cleanPatterns (str, front) {
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const charCount = 12
  let fullPattern
  if (front) { fullPattern = new RegExp('^.{0,' + charCount + '}?' + cleanStrPattern.source, 'si') } else { fullPattern = new RegExp(cleanStrPattern.source + '.{0,' + 7 + '}$', 'si') }

  for (let i = 0; i < 50; i++) { str = str.replace(fullPattern, ' ') }

  return str.split(/\s/).slice(1, -1).join(' ').replace(/[^A-Z\s]|_/gi, ' ').replace(/\s\s+/g, ' ').trim()
}
*/
// Takes from and to as args and returns array with incremental elements starting wtih from and ending with to
function getFromToArr (from, to) {
  let tempArr = []
  for (let i = from; i <= to; i++) { tempArr = tempArr.concat(i) }
  return tempArr
}

// This will make the python 3 script run in multiple os environments
// https://stackoverflow.com/questions/20643470/execute-a-command-line-binary-with-node-js
// https://stackoverflow.com/a/35586247
// https://medium.com/swlh/run-python-script-from-node-js-and-send-data-to-browser-15677fcf199f
function runPyScript (pathToScript, args) {
  // Using windows py to run python version 3
  let output = spawnSync('py', ['-3', pathToScript].concat(args))
  // Using python3 binary to run python version 3, if above fails
  if (output.error) { output = spawnSync('python3', [pathToScript].concat(args)) }
  // assuming python 3 is named as python in the system
  if (output.error) { output = spawnSync('python', [pathToScript].concat(args)) }
  if (output.error) { console.log('Either the translate script have failed or Python 3 might not be installed in the system') }

  return output.stdout.toString()
}

// Takes a string & returns all the translations of a given query in an array
// It could break anytime ,reasons include timeout, api broken etc
function translateQuery (query) {
  try {
    const result = runPyScript('translateToMulti.py', [query])
    return JSON.parse(result)
  } catch (error) {
    console.error(error)
    return []
  }
}

// Takes array of translated queries and confirmed verses & save to questionverses.min.json
function saveQuestionVerses (query, verses) {
// sort the passed verses
  verses.sort()
  const joinedVerses = verses.join(',')
  //
  let saved = false
  for (let i = 0; i < questionVerses.values.length; i++) {
  // Check verses exists, if exists then push the query in the questions array
  // So that things are saved efficiently
    if (questionVerses.values[i].verses.join(',') === joinedVerses) {
      questionVerses.values[i].questions.push(...query)
      saved = true
      break
    }
  }
  // if saved is still false, then push the new question & verses
  if (saved === false) { questionVerses.values.push({ questions: query, verses: verses }) }

  // Save the questionVerses back to filesystem
  fs.writeFileSync(questionVersesPath, JSON.stringify(questionVerses))
}

// Creating line to [chapter,verseNo] mappings
// Array containing number of verses in each chapters
const chaplength = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6]
// contains chapter verse mappings for each line
const mappings = []
const mappingsStr = []

for (let i = 1; i <= 114; i++) {
  for (let j = 1; j <= chaplength[i - 1]; j++) {
    mappings.push([i, j])
    mappingsStr.push(i + ',' + j)
  }
}
/*
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
*/
// const multiVersePattern = /\s[0-9]{1,3}\s{0,5}:\s{0,5}[0-9]{1,3}\s{0,5}(-|to|and)\s{0,5}[0-9]{1,3}/gi

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

// const tempPatternArr = confirmPattern.map(e => e.source).concat(arabicQuranName.map(e => e[0].source))
// This stores the pattern to clean verse patterns etc from string
// const cleanStrPattern = new RegExp('(' + tempPatternArr.reduce((full, val) => full + '|' + val) + ')')

const arabicEnglishQuranName = arabicQuranName.concat(englishQuranName)
