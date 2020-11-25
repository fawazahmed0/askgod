import sys
import json
import urllib.request
# Refer https://github.com/ssut/py-googletrans to see examples on how to use this package
from google_trans_new import google_translator  
translator = google_translator()  


# use Ubuntu 20.04.1 LTS in actions

# Give a string to it as cmd argument and it will return all different languages & it's pronunciation

#translator = Translator(service_urls=['translate.googleapis.com']) 
#translator = Translator(service_urls=['translate.google.com']) 



googlecodes = 'https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/isocodes/google-codes.min.json'
req = urllib.request.Request(googlecodes)

args = sys.argv

# Removing the script name from args
args.pop(0)
sys.stdout.reconfigure(encoding='utf-8')

##parsing response
r = urllib.request.urlopen(req).read()
cont = json.loads(r.decode('utf-8'))

for key in cont.keys():
    #translation = translator.translate('hamein kyun aisa nahi karna',dest=key)
    translate_text = translator.translate(args[0],lang_tgt=key)  
    print(translate_text)
    #print(key)
    #print(translation.text)
    #print(translation.pronunciation)




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
