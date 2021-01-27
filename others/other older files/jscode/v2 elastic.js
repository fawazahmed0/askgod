// Maximum verse number
const MAX_VERSE = 286


// Store the translation to be used for verse detection logically when no ML model is available
var translation;



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


var lunrIndex
async function begin(){
translation = await getTranslation("https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/eng-ummmuhammad.min.json")
var optimizedTrans = getOptimizedArr(translation)
var avgarr = getAvergeVerseLenArr(optimizedTrans)
var cleanTransArr = cleanTrans(optimizedTrans)
 lunrIndex = getLunrIndex(cleanTransArr)

// String should be clean from unknown chars like ‘ etc when searching with lunrjs
for(var val of cleanTransArr.slice(500,2000))
lunrIndex.search(val.replace(/[^a-z']/gi," ").replace(/\s\s+/gi, " "))
console.log(avgarr)



}
begin()
async function getTranslation(url){
return await fetch(url).then(response => response.json())

}

function cleanTrans(translationArr){
return translationArr.flat().map(e=> e.replace(/[^a-z']/gi," ").replace(/\s\s+/gi, " "))
}

// Returns an array have average langth value for each verse no 1 to 286
function getAvergeVerseLenArr(translationArr){
var avgarr = []
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



  var idx = elasticlunr(function () {
    this.setRef('id')
    this.addField('text')


  })

  transDocs.forEach(function (doc) {
    idx.addDoc(doc);
  })

return idx

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
