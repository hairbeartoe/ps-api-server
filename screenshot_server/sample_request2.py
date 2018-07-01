from __future__ import print_function
import requests
import sys

api_url = 'http://localhost:5000/png'

payload = {
        'url': sys.argv[1],
        'width': '1024',
        'delay': 15000,
        'force': False,
        'full_page': True,
        'scroll': True
}

r = requests.get(api_url, params=payload)
print("full request URL:", r.url)
print("status code:", r.status_code)
if r.status_code != 200:
    print(r.content)
else:
    outf_name = sys.argv[1].replace('https://', '').replace('/', '_')+'.png'
    print("Output to", outf_name)
    with open(outf_name, 'wb') as outf:
        outf.write(r.content)
