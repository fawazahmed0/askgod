import sys
import json
import urllib.request
# Refer https://github.com/lushan88a/google_trans_new to see examples on how to use this package
from google_trans_new import google_translator
import random
import time
translator = google_translator(url_suffix="hk",timeout=10)  

sys.stdout.reconfigure(encoding='utf-8')

# use Ubuntu 20.04.1 LTS in actions
g_codes_link = 'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/isocodes/google-codes.min.json'
req = urllib.request.Request(g_codes_link)
##parsing response
read_res = urllib.request.urlopen(req).read()
g_codes = json.loads(read_res.decode('utf-8'))


args = sys.argv
# Removing the script name from args
args.pop(0)


translated_list = []



for key in g_codes.keys():
#for key in ['hi','ar']:
    #translation = translator.translate('hamein kyun aisa nahi karna',dest=key)
    time.sleep(random.uniform(0.2, 0.5))
    translate_text = translator.translate(args[0],lang_tgt=key)  
    translated_list.append(translate_text)
    #print(translation.text)
    #print(translation.pronunciation)


sys.stdout.write(json.dumps(translated_list))

# https://stackoverflow.com/a/52372390
# Not setting to utf-8 explicitly as python3 is utf-8 by default and it requires python 3.7+ to run the below command
# The below will fail in py 3.6


# python command line args https://www.tutorialspoint.com/python/python_command_line_arguments.htm


# This script will take an array of text strings and return back  result the googletrans library gives in json format to stdout









#translation = translator.translate('వారు ఎందుకు పోరాడుతున్నారు',dest='ar')
#sys.stdout.write('[')
#print(translation.extra_data['translation'])
#print(translation.text)
#print(translation.pronunciation)

#sys.stdout.write(']')
# Last element in the array returned is empty string, you need to remove that before usage
