"""Public evidence GETs only; exact paths obtained from saved catalog links."""
import json, pathlib, datetime, urllib.request, hashlib
root=pathlib.Path(__file__).parent
models=json.loads((root/'evidence/openrouter-models-public-snapshot.json').read_text(encoding='utf-8-sig'))['data']
chosen={'openai/gpt-6.1-sol','anthropic/claude-sonnet-5','openai/o3-mini','google/gemini-3.8-flash'}
records=[]
for m in models:
    if m['id'] not in chosen: continue
    relative=m.get('links',{}).get('details')
    if not relative: continue
    url='https://openrouter.ai'+relative
    at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
    try:
        response=urllib.request.urlopen(url,timeout=25)
        body=response.read()
        payload=json.loads(body)
        file='evidence/openrouter-endpoints-'+m['id'].replace('/','--').replace(':','--')+'.json'
        (root/file).write_text(json.dumps(payload,separators=(',',':'))+'\n',encoding='utf-8')
        record=dict(nativeModelId=m['id'],url=url,retrievedAt=at,statusCode=response.status,headers={k:v for k,v in response.headers.items() if k.lower() in ('date','content-type','etag','last-modified')},sha256NetworkPayload=hashlib.sha256(body).hexdigest(),savedFile=file,payloadKeys=list(payload),error=None)
        eps=payload.get('data',{}).get('endpoints',[])
        record['endpointSummary']=[{k:e.get(k) for k in ('provider_name','name','context_length','max_completion_tokens','supported_parameters','supported_reasoning_efforts','default_parameters','tag')} for e in eps]
    except Exception as error:
        record=dict(nativeModelId=m['id'],url=url,retrievedAt=at,statusCode=None,error=str(error),savedFile=None)
    records.append(record)
    (root/'evidence/openrouter-endpoint-retrieval-audit.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(record,indent=2))
