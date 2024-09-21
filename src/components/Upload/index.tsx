import React, {ChangeEvent, FC, useRef} from 'react';

import './index.css';

const SIZE = 10 * 1024 * 1024;
const BASE = 'http://localhost:8080';
const UPLOAD_API = '/web/upload';
const MERGE_API = '/web/merge';
const VERIFY_API = '/web/verify';

type IRequestOptions = {
  url: string;
  method?: 'post' | 'get';
  data?: FormData | string;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

type IUploadOptionType = {
  chunkList: Array<{
    chunk: Blob,
    chunkHash: string,
  }>;
  fileName: string;
  fileHash: string;
};

const Upload: FC = () => {
  const uploadControllerList = useRef<AbortController[]>([]);
  const uploadedListRef = useRef<string[]>([]);
  const request = <T = any, >(opts: IRequestOptions): Promise<T> => {
    const {url, method = 'post', data, headers = {}, signal} = opts;
    return new Promise(async (resolve) => {
      const res = await fetch(url, {
        method,
        body: data,
        headers,
        signal,
      });
      const json = await res.json();
      resolve(json);
    })
  }
  const createFileChunks = (file: File, size = SIZE): Array<{ chunk: Blob }> => {
    /*
    File(Blob) => ArrayBuffer: FileRead.readAsArrayBuffer()
    ArrayBuffer => Blob: new Blob([new Uint8Array(data])
    */
    let cur = 0;
    const chunkList = [];
    while (cur < file.size) {
      chunkList.push({
        chunk: file.slice(cur, cur + size),
      });
      cur += size;
    }
    return chunkList;
  }
  const uploadChunks = async ({chunkList, fileHash, fileName}: IUploadOptionType) => {
    const abortSignalList = Array.from({length: chunkList.length}).map(() => new AbortController());
    uploadControllerList.current = abortSignalList;
    const requestList = chunkList.filter(({chunkHash}) => !uploadedListRef.current.includes(chunkHash))
      .map(({chunk, chunkHash}) => {
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('chunkHash', chunkHash);
        formData.append('fileHash', fileHash);
        formData.append('fileName', fileName);
        return formData;
      }).map((formData, index) => request({
        url: `${BASE}${UPLOAD_API}`,
        data: formData,
        signal: abortSignalList[index].signal,
      }));
    await Promise.all(requestList);
    await request({
      url: `${BASE}${MERGE_API}`,
      data: JSON.stringify({fileName, fileHash, size: SIZE}),
      headers: {"content-type": "application/json"},
    });
  }
  const computeHash = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const worker = new Worker('./calculateHash.js');
      worker.postMessage({file});
      worker.onmessage = (e: MessageEvent<{ hash: string }>) => {
        const {hash} = e.data;
        if (hash) resolve(hash);
      }
    });
  }
  const handlePauseUpload = () => {
    uploadControllerList.current.forEach(controller => {
      controller.abort();
    });
    uploadControllerList.current = [];
  }
  const handleResumeUpload = () => {

  }
  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const [file] = Array.from(e.currentTarget.files || []);
    if (!file) return;
    console.time('calculate hash')
    const hash = await computeHash(file);
    console.timeEnd('calculate hash');
    const {uploaded, uploadedList} = await request({
      url: `${BASE}${VERIFY_API}`,
      data: JSON.stringify({fileHash: hash, fileName: file.name}),
      headers: {"content-type": "application/json"},
    });
    uploadedListRef.current = uploadedList;
    if (uploaded) {
      console.log('upload success');
      return;
    }
    const chunks = createFileChunks(file);
    const chunkList = chunks.map(({chunk}, index) => {
      return {
        chunk,
        chunkHash: `${hash}-${index}`,
      }
    });
    await uploadChunks({
      chunkList,
      fileName: file.name,
      fileHash: hash
    });
  }
  return (
    <div>
      <input className='upload-input' type='file' onChange={handleChange}/>
      <button onClick={handlePauseUpload}>pause upload</button>
      <button onClick={handleResumeUpload}>resume upload</button>
    </div>
  );
}

export default Upload;
