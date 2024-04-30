import { crypto, ensureFile, join, toWritableStream } from "./deps.ts";

interface UploadOptions {
  path?: string;
  extensions?: Array<string>;
  maxSizeBytes?: number;
  maxFileSizeBytes?: number;
  saveFile?: boolean;
  readFile?: boolean;
  useCurrentDir?: boolean;
  useDateTimeSubDir?: boolean;
}

const defaultUploadOptions: UploadOptions = {
  path: "uploads",
  extensions: [],
  maxSizeBytes: Number.MAX_SAFE_INTEGER,
  maxFileSizeBytes: Number.MAX_SAFE_INTEGER,
  saveFile: true,
  readFile: false,
  useCurrentDir: true,
  useDateTimeSubDir: true,
}

function upload(
  options: UploadOptions = defaultUploadOptions,
) {
    const mergedOptions = { ...defaultUploadOptions, ...options };
    const {
      path,
      extensions,
      maxSizeBytes,
      maxFileSizeBytes,
      saveFile,
      readFile,
      useCurrentDir,
    } = mergedOptions;

    return async (context: any, next: any) => {
      if (parseInt(context.request.headers.get("content-length")!) > maxSizeBytes!) {
        context.throw(422,
                  `Maximum total upload size exceeded, size: ${
                    context.request.headers.get("content-length")
                  } bytes, maximum: ${maxSizeBytes} bytes. `,
                 );
        await next();
      }

      const boundaryRegex = /^multipart\/form-data;\sboundary=(?<boundary>.*)$/;
      let match: RegExpMatchArray | null;

      if (context.request.headers.get("content-type") &&
          (match = context.request.headers.get("content-type")!.match(
            boundaryRegex,
            )
        )) {
        const reqBody = await context.request.body.formData();
        const res: any = {};
        let validations = "";

        for (const item of reqBody.entries()) {
          if (item[1] instanceof File) {
            if (extensions!.length > 0) {
              const ext = item[1].name.split(".").pop();
              if (!extensions!.includes(ext)) {
                validations += `The file extension is not allowed (${ext} in ${
                  item[1].name
                }), allowed extensions: ${extensions}. `;
              }
            }
            if (item[1].size > maxFileSizeBytes!) {
              validations += `Maximum file upload size exceeded, file: ${
                item[1].name
              }, size: ${
                item[1].size
              } bytes, maximum: ${maxFileSizeBytes} bytes. `;
            }
          }

          if (validations != "") {
            context.throw(422, validations);
            await next();
          }

          for (const item of reqBody.entries()) {
            if (item[1] instanceof File) {
              const formField: any = item[0];
              const fileData: any = item[1];
              const resData: any = {
                name: fileData.name,
                size: fileData.size,
              };
              const d = new Date();
              var filePath = join(
                d.getFullYear().toString(),
                (d.getMonth() + 1).toString(),
                d.getDate().toString(),
                d.getHours().toString(),
                d.getMinutes().toString(),
                d.getSeconds().toString(),
                crypto.randomUUID(),
                fileData.name,
              );

              if (path) {
                filePath = join(path!, filePath);
              }

              if (useCurrentDir) {
                resData["uri"] = join(Deno.cwd(), filePath);
              } else {
                resData["uri"] = filePath;
              }

              await ensureFile(resData["uri"]);
              resData["url"] = encodeURI(
                filePath.replace(/\\/g, "/"),
              );
              fileData.stream().pipeTo(
                toWritableStream(
                  await Deno.open(resData["uri"], { create: true, write: true }),
                ),
              );

              if (readFile) {
                resData["data"] = await Deno.readFile(resData["uri"]);
              }

              if (!saveFile) {
                await Deno.remove(resData["uri"]);
                delete resData["url"];
                delete resData["uri"];
              }

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

          context["uploadedFiles"] = res;
        }
      } else {
          context.throw(
            422,
            'Invalid upload data, request must contains a body with form "multipart/form-data", and inputs with type="file". ',
          );
      }
      await next();
    }
}

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
    await next();
  };
};

export { upload, preUploadValidate };
