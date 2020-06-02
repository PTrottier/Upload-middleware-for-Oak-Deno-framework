import { ensureDir, v4, move, MultipartReader } from "./deps.ts";

const upload = function (
  path: string,
  extensions: Array<string> = [],
  maxSizeBytes: number = Number.MAX_SAFE_INTEGER,
  maxFileSizeBytes: number = Number.MAX_SAFE_INTEGER,
  useCurrentDir: boolean = true,
) {
  return async (context: any, next: any) => {
    if (
      parseInt(context.request.headers.get("content-length")) > maxSizeBytes
    ) {
      context.throw(
        422,
        `Maximum total upload size exceeded, size: ${
          context.request.headers.get("content-length")
        } bytes, maximum: ${maxSizeBytes} bytes. `,
      );
      next();
    }
    const boundaryRegex = /^multipart\/form-data;\sboundary=(?<boundary>.*)$/;
    let match: RegExpMatchArray | null;
    if (
      context.request.headers.get("content-type") &&
      (match = context.request.headers.get("content-type")!.match(
        boundaryRegex,
      ))
    ) {
      const formBoundary: string = match.groups!.boundary;
      const mr = new MultipartReader(
        context.request.serverRequest.body,
        formBoundary,
      );
      const form = await mr.readForm(0);
      let res: any = {};
      let entries: any = Array.from(form.entries());
      let validations = "";
      for (const item of entries) {
        let values: any = [].concat(item[1]);
        for (const val of values) {
          if (val.filename !== undefined) {
            if (extensions.length > 0) {
              let ext = val.filename.split(".").pop();
              if (!extensions.includes(ext)) {
                validations +=
                  `The file extension is not allowed (${ext} in ${val.filename}), allowed extensions: ${extensions}. `;
              }
            }
            if (val.size > maxFileSizeBytes) {
              validations +=
                `Maximum file upload size exceeded, file: ${val.filename}, size: ${val.size} bytes, maximum: ${maxFileSizeBytes} bytes. `;
            }
          }
        }
      }
      if (validations != "") {
        await form.removeAll();
        context.throw(422, validations);
        next();
      }
      for (const item of entries) {
        let formField: any = item[0];
        let filesData: any = [].concat(item[1]);
        for (const fileData of filesData) {
          if (fileData.tempfile !== undefined) {
            const uuid = `${d.getFullYear()}/${d.getMonth()}/${d.getDay()}/${d.getHours()}/${d.getMinutes()}/${d.getSeconds()}/${v4.generate()}`; //TODO improve to use of v5
            const d = new Date();
            const uploadPath = `${path}/${uuid}`;
            let fullPath = uploadPath;
            if (useCurrentDir) {
              fullPath = `${Deno.cwd()}/${fullPath}`;
            }
            await ensureDir(fullPath);
            await move(
              fileData.tempfile,
              `${fullPath}/${fileData.filename}`,
            );
            let resData = fileData;
            delete resData["tempfile"];
            resData["id"] = uuid;
            resData["url"] = encodeURI(
              `${uploadPath}/${fileData.filename}`,
            );
            resData["uri"] = `${fullPath}/${fileData.filename}`;
            if (res[formField] !== undefined) {
              if (Array.isArray(res[formField])) {
                res[formField].push(resData);
              } else {
                res[formField] = [res[formField], resData];
              }
            } else {
              res[formField] = resData;
            }
          }
        }
      }
      context["uploadedFiles"] = res;
    } else {
      context.throw(
        422,
        'Invalid upload data, request must contains a body with form "multipart/form-data", and inputs with type="file". ',
      );
    }
    next();
  };
};
const preUploadValidate = function (
  extensions: Array<string> = [],
  maxSizeBytes: number = Number.MAX_SAFE_INTEGER,
  maxFileSizeBytes: number = Number.MAX_SAFE_INTEGER,
) {
  return async (context: any, next: any) => {
    let jsonData = await context.request.body();
    jsonData = jsonData["value"];
    let totalBytes = 0;
    let validations = "";
    for (const iName in jsonData) {
      let files: any = [].concat(jsonData[iName]);
      for (const file of files) {
        totalBytes += jsonData[iName].size;
        if (file.size > maxFileSizeBytes) {
          validations +=
            `Maximum file upload size exceeded, file: ${file.name}, size: ${file.size} bytes, maximum: ${maxFileSizeBytes} bytes. `;
        }
        if (!extensions.includes(file.name.split(".").pop())) {
          validations += `The file extension is not allowed (${
            file.name.split(".").pop()
          } in ${file.name}), allowed extensions: ${extensions}. `;
        }
      }
    }
    if (totalBytes > maxSizeBytes) {
      validations +=
        `Maximum total upload size exceeded, size: ${totalBytes} bytes, maximum: ${maxSizeBytes} bytes. `;
    }
    if (validations != "") {
      context.throw(422, validations);
    }
    next();
  };
};
export { upload, preUploadValidate };
