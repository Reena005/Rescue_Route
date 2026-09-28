// ============================================================
// Data lake storage (Module 5)
//
// Writes export files to HDFS when HDFS_NAMENODE_URL is set,
// otherwise to a local folder with the same layout.
//
// HDFS is written through WebHDFS, the REST API built into the
// HDFS NameNode, so no Hadoop client libraries are needed:
//   1. PUT  <namenode>/webhdfs/v1/<path>?op=CREATE  -> 307 redirect
//   2. PUT  <datanode location from step 1>, body = file content
//
// Environment:
//   HDFS_NAMENODE_URL   e.g. http://localhost:9870  (not set = local)
//   HDFS_USER           HDFS user name (default "hadoop")
//   HDFS_BASE_PATH      default /rescueroute/warehouse
//   ANALYTICS_LOCAL_DIR default <project>/datalake/warehouse
// ============================================================

const fs = require("fs/promises");
const path = require("path");

const HDFS_NAMENODE_URL = process.env.HDFS_NAMENODE_URL?.replace(/\/+$/, "");
const HDFS_USER = process.env.HDFS_USER || "hadoop";
const HDFS_BASE_PATH =
    (process.env.HDFS_BASE_PATH || "/rescueroute/warehouse").replace(/\/+$/, "");

const LOCAL_BASE_DIR =
    process.env.ANALYTICS_LOCAL_DIR ||
    path.resolve(__dirname, "../../../datalake/warehouse");

const REQUEST_TIMEOUT_MS = 30000;


const getStorage = () =>
    HDFS_NAMENODE_URL ? "HDFS" : "LOCAL";


const getLocation = () =>
    HDFS_NAMENODE_URL
        ? `${HDFS_NAMENODE_URL} ${HDFS_BASE_PATH}`
        : LOCAL_BASE_DIR;


const writeHdfs = async (hdfsPath, content) => {
    const params = new URLSearchParams({
        op: "CREATE",
        overwrite: "true",
        "user.name": HDFS_USER
    });

    // Step 1: ask the NameNode where to write
    const create = await fetch(
        `${HDFS_NAMENODE_URL}/webhdfs/v1${hdfsPath}?${params}`,
        {
            method: "PUT",
            redirect: "manual",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        }
    );

    const location = create.headers.get("location");

    if (create.status !== 307 || !location) {
        const body = await create.text().catch(() => "");

        throw new Error(
            `WebHDFS CREATE failed (${create.status}): ${body.slice(0, 200)}`
        );
    }

    // Step 2: send the data to the DataNode
    const upload = await fetch(location, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: content,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (upload.status !== 201) {
        const body = await upload.text().catch(() => "");

        throw new Error(
            `WebHDFS upload failed (${upload.status}): ${body.slice(0, 200)}`
        );
    }
};


// Write one file; relativePath like "incidents/dt=2026-07-01/part-00000.json".
// Returns the full path it was written to.
const writeFile = async (relativePath, content) => {
    if (HDFS_NAMENODE_URL) {
        const hdfsPath = `${HDFS_BASE_PATH}/${relativePath}`;

        await writeHdfs(hdfsPath, content);

        return hdfsPath;
    }

    const localPath = path.join(LOCAL_BASE_DIR, ...relativePath.split("/"));

    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, content, "utf8");

    return localPath;
};


module.exports = {
    getStorage,
    getLocation,
    writeFile
};
