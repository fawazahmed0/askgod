

const fs = require('fs');
const path = require('path')
const fetch = require('node-fetch');

fetch(`https://api.alquran.cloud/v1/quran/en.yusufali`).then(response => response.json())
  .then(data => {
      fs.writeFileSync("en.yusufali.json", JSON.stringify(data))
  })
