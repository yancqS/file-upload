self.importScripts('./spark-md5.min.js');

self.onmessage = (e) => {
  const {file} = e.data;
  const spark = new self.SparkMD5.ArrayBuffer();
  const fileReader = new FileReader();
  fileReader.onload = (e) => {
    spark.append(e.target.result);
    self.postMessage({
      hash: spark.end(),
    });
  };
  fileReader.readAsArrayBuffer(file);
};
