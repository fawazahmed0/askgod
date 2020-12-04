import sys
import json
from google_trans_new import google_translator
import random
import time

# This script takes string as arguments and return back english translation of it

# Refer https://github.com/lushan88a/google_trans_new to see examples on how to use this package
translator = google_translator(url_suffix="hk", timeout=10)

# Set to UTF-8 to avoid error
# it requires python 3.7+ to run the below command
#sys.stdout.reconfigure(encoding='utf-8')

# python command line args https://www.tutorialspoint.com/python/python_command_line_arguments.htm
args = sys.argv
# Removing the script name from args
args.pop(0)

# use Ubuntu 20.04.1 LTS in Github actions



translate_text = translator.translate(
        args[0], lang_tgt='en')


# Print out the list to stdout
sys.stdout.write(translate_text)
