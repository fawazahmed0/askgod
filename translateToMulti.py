import sys
import json
import urllib.request
from google_trans_new import google_translator
import random
import time

# This script will take a string and return back all the translations of it in an array

# Refer https://github.com/lushan88a/google_trans_new to see examples on how to use this package
translator = google_translator(url_suffix="hk", timeout=10)

# Set to UTF-8 to avoid error
# it requires python 3.7+ to run the below command
sys.stdout.reconfigure(encoding='utf-8')

# python command line args https://www.tutorialspoint.com/python/python_command_line_arguments.htm
args = sys.argv
# Removing the script name from args
args.pop(0)

# use Ubuntu 20.04.1 LTS in Github actions
# can be refactored by using a local version of google-codes.min called by node at first time

# Fetch google codes
g_codes_link = 'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/isocodes/google-codes.min.json'
req = urllib.request.Request(g_codes_link)
read_res = urllib.request.urlopen(req).read()
g_codes = json.loads(read_res.decode('utf-8'))


# Store the translated texts
translated_list = []

for key in g_codes.keys():
    # sleep randomly between 0.2-0.5 seconds to avoid blocking
    time.sleep(random.uniform(0.2, 0.5))
    translate_text = translator.translate(
        args[0], lang_tgt=key, pronounce=True)
    # Remove None ,false etc from the result and then concat
    translated_list = translated_list + list(filter(None, translate_text))
    # print(translation.text)
    # print(translation.pronunciation)
# Remove duplicates
translated_list = list(set(translated_list))
# Print out the list to stdout
sys.stdout.write(json.dumps(translated_list))
