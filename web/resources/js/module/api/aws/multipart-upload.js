import 'js/plugin/aws/aws-sdk-2.1101.0.min';

//FILE CHUNK SIZE (5MB)
const CHUNK_SIZE = 1024 * 1024 * 5;
//AWS BUCKET NAME
const BUCKET_NAME = 'BUCKET_NAME';
//LOCAL OR AWS MODE SELECT
const UPLOAD_MODE = Object.freeze({
    LOCAL: 'LOCAL',
    AWS: 'AWS'
})
//INITIALIZE MODE
const MULTIPART_UPLOAD_MODE = UPLOAD_MODE.AWS;

let s3; // SDK Object
let detect_leave = false;

/**
 * FileUploadInfo,
 * File upload 기능을 사용할 떄의 생성자
 * @requires [getUUID]
 * */
class FileUploadInfo {

    /**
     * Create File FileUploadInfo Constructor
     * @param {File} file - File Object
     * */
    constructor(file) {
        this.file = file;
        this.byte_flag = 0;
        this.part_index = 1;
        this.uuid = getUUID().substr(-6) + '_';
        this.canceled = false;
        this.upload_id = null;
    }
}

let fnOnLeave = () => {
}

/**
 * Window.OnBeforeUnLoad,
 * Window 객체가 Unload 되기 직전에 실행되는 이벤트 함수,
 * 이벤트를 사용하면 사용자가 페이지를 떠날 때 정말로 떠날 것인지 묻는 확인 대화 상자를 표시할 수 있는 함수
 * */
window.onbeforeunload = () => {
    if (detect_leave) return true;
};

/**
 * Window.OnUnLoad,
 * Window 객체가 Unload 될때 실행되는 이벤트 함수,
 * 즉 페이지 나갈때 실행되는 함수
 *
 * @requires [fnOnLeave]
 * */
window.onunload = () => {
    fnOnLeave();
};

/**
 * InitializeAWSS3,
 * AWS S3 File Upload 초기화 함수
 *
 * @requires [aws-sdk-2.1101.0.min.js]
 * @param {string} AWS_REGION AWS S3 지역
 * @param {string} IDENTITY_POOL_ID aws cognito 자격증명 풀 ID
 * */
function initializeAWSS3(AWS_REGION = 'ap-northeast-2', IDENTITY_POOL_ID = 'ap-northeast-2:6ec05f63-7d98-4614-964b-dd77eb385337') {
    AWS.config.region = AWS_REGION;
    AWS.config.credentials = new AWS.CognitoIdentityCredentials({
        IdentityPoolId: IDENTITY_POOL_ID,
    });
    s3 = new AWS.S3({
        Bucket: BUCKET_NAME
    });
}

/**
 * CancelMultipartUpload,
 * 파일 업로드 중 취소할때 사용하는 함수
 *
 * @param {function} cancelCallback 취소시 실행시킬 콜백 함수
 * */
function cancelMultipartUpload(cancelCallback) {
    if (confirm('전송중인 파일이 삭제됩니다. 중단하시겠습니까?')) {
        console.log('전송을 중단합니다.');
        cancelCallback();
    }
}

/**
 * HandleMultipartUploadFail,
 * Multipart Upload 실패시 실행되는 함수
 *
 * @requires [unobservePageLeave]
 * */
function handleMultipartUploadFail() {
    console.log(this.part_index + '번째 파트 전송중 실패');
    unobservePageLeave();
}

/**
 * HandleMultipartUploadCancel,
 * Multipart Upload 중단시 실행되는 함수
 *
 * @requires [unobservePageLeave]
 * */
function handleMultipartUploadCancel() {
    console.log(this.part_index + '번째 파트 전송중 중단');
    unobservePageLeave();
}

/**
 * HandleMultipartUploadComplete,
 * Multipart Upload 완전히 성공시 실행되는 함수
 *
 * @requires [unobservePageLeave]
 * */
function handleMultipartUploadComplete() {
    console.log('전송완료');
    unobservePageLeave();
}

/**
 * HandlePartUploadSuccess,
 * Multipart Upload 성공시 실행되는 함수,
 * 해당 함수는 Chunk가 성공적으로 업로드 될때마다 실행되는 함수
 *
 * @param {number} progress_percent 백분율의 값
 * */
function handlePartUploadSuccess(percent) {
    console.log(percent + '% 진행');
}

/**
 * ObservePageLeave,
 * Observe API 콜백 등록하는 함수
 *
 * @requires [fnOnLeave]
 * @param {function} callback Observe API 등록할 함수
 * */
function observePageLeave(callback) {
    detect_leave = true;
    fnOnLeave = callback;
}

/**
 * UnObservePageLeave,
 * Observe API 등록된 콜백을 해제하는 함수
 *
 * @requires [fnOnLeave]
 * */
function unobservePageLeave() {
    detect_leave = false;
    fnOnLeave = () => {
    };
}

/**
 * AwsMultipartUpload,
 * 파일을 CHUNK로 분할하여 AWS에 업로드 시키는 함수,
 *
 * @requires [observePageLeave, abortMultipartUpload, partUpload, handleMultipartUploadFail, handlePartUploadSuccess, completeMultipartUpload, uploadBlob]
 * @param {string} dir_path AWS 디렉토리
 * @param {File} file 업로드 할려는 파일
 * @param {function} completeCallback 성공시 UI를 수정하는 콜백 함수
 * @param {function} progressCallback 파일 업로드 진행시 진행상황 UI를 수정하는 콜백 함수
 *  */
function awsMultipartUpload(path, file, completeCallback, progressCallback) {
    let fileUploadInfo = new FileUploadInfo(file);

    observePageLeave(abortMultipartUpload);

    const eTagParts = []; // etags for complete
    const Multipart_Object_Key = path + fileUploadInfo.uuid + fileUploadInfo.file.name;
    const params = {
        Bucket: BUCKET_NAME,
        Key: Multipart_Object_Key
    };
    s3.createMultipartUpload(params, partUpload);

    /**
     * PartUpload,
     * AWS에 CHUNK를 업로드한 이후에 콜백 함수
     *
     * @requires [abortMultipartUpload, handleMultipartUploadFail, handlePartUploadSuccess, completeMultipartUpload, abortMultipartUpload, handleMultipartUploadCancel, uploadBlob]
     * @param {Object} err AWS가 돌려주는 Error 오브젝트
     * @param {Object} data AWS가 돌려주는 Data 오브젝트
     *  */
    function partUpload(err, data) {
        if (err) { // an error occurred
            console.log(err, err.stack);
            abortMultipartUpload();
            handleMultipartUploadFail();
            return;
        }

        if (data.UploadId) { // init 됐을때 받은 upload id 저장
            fileUploadInfo.upload_id = data.UploadId;
        } else { // 파일 전송시
            const progress_percent = Math.floor(((fileUploadInfo.byte_flag - CHUNK_SIZE) / fileUploadInfo.file.size) * 100);
            handlePartUploadSuccess(progress_percent);
            completeCallback(progress_percent, fileUploadInfo.byte_flag);
        }
        if (data.ETag) { // 성공한 request 의 ETag 담기
            eTagParts.push({
                ETag: data.ETag,
                PartNumber: fileUploadInfo.part_index - 1
            });
        }
        if (fileUploadInfo.byte_flag >= fileUploadInfo.file.size) { // 전송 완료
            completeMultipartUpload(err, data);
            return;
        }
        if (fileUploadInfo.canceled) { // 업로드 취소
            abortMultipartUpload();
            handleMultipartUploadCancel();
            return;
        }

        const blob = file.slice(fileUploadInfo.byte_flag, Math.min(fileUploadInfo.file.size, fileUploadInfo.byte_flag + CHUNK_SIZE));
        uploadBlob(blob); // recursive for awsMulitpartUpload
        /* ex)
        data = {
         Bucket: "examplebucket",
         Key: "largeobject",
         UploadId: "ibZBv_75gd9r8lH_gqXatLdxMVpAlj6ZQjEs.OwyF3953YdwbcQnMA2BLGn8Lx12fQNICtMw5KyteFeHw.Sjng--"
        }
        */
        /**
         * UploadBlob,
         * CHUNK를 업로드하는 함수
         *
         * @requires [partUpload]
         * @param {Blob} blob 파일의 일부분 CHUNK(BLOB)
         *  */
        function uploadBlob(blob) {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = () => {
                const uploadPart_params = {
                    Body: blob,
                    Bucket: BUCKET_NAME,
                    Key: Multipart_Object_Key,
                    PartNumber: fileUploadInfo.part_index,
                    UploadId: fileUploadInfo.upload_id
                };
                fileUploadInfo.byte_flag += CHUNK_SIZE;
                fileUploadInfo.part_index += 1;
                s3.uploadPart(uploadPart_params, partUpload); // upload next part
            }
        }
    }

    /**
     * CompleteMultipartUpload,
     * Multipart 파일 업로드가 성공적으로 업로드 됬을때 실행되는 함수
     *
     * @requires [completeMultipartUpload, completeCallback]
     * @param {Object} err AWS가 돌려주는 Error 오브젝트
     * @param {Object} data AWS가 돌려주는 Data 오브젝트
     *  */
    function completeMultipartUpload(err, data) {
        if (err) { // an error occurred
            console.log(err, err.stack);
            abortMultipartUpload();
        } else { // successful response
            const complete_params = {
                Bucket: BUCKET_NAME,
                Key: Multipart_Object_Key,
                MultipartUpload: {
                    Parts: eTagParts
                },
                UploadId: fileUploadInfo.upload_id
            };
            s3.completeMultipartUpload(complete_params, completeCallback);
        }

        /* ex)
        data = {
         ETag: "\"d8c2eafd90c266e19ab9dcacc479f8af\""
        }
        */

        /**
         * CompleteCallback,
         * completeMultipartUpload 가 성공적으로 수행됬을때의 콜백 함수
         *
         * @requires [handleMultipartUploadComplete, Self]
         * @param {Object} err AWS가 돌려주는 Error 오브젝트
         * @param {Object} data AWS가 돌려주는 Data 오브젝트
         * ex)
         * data = {
         *  Bucket: "acexamplebucket",
         *  ETag: "\"4d9031c7644d8081c2829f4ea23c55f7-2\"",
         *  Key: "bigobject",
         *  Location: "https://examplebucket.s3.<Region>.amazonaws.com/bigobject"
         * }
         *  */
        function completeCallback(err, data) {
            if (err) console.log(err, err.stack); // an error occurred
            else { // successful response
                console.log(data);
                handleMultipartUploadComplete();
                completeCallback(data.Location);
            }

        }
    }

    /**
     * AbortMultipartUpload,
     * Multipart Upload 전송을 취소할때의 실행되는 함수
     * */
    function abortMultipartUpload() {
        console.log('전송 취소');
        const abort_params = {
            Bucket: BUCKET_NAME,
            Key: Multipart_Object_Key,
            UploadId: upload_id
        };
        s3.abortMultipartUpload(abort_params, (err, data) => {
            if (err) console.log(err, err.stack); // an error occurred
            else console.log(data);           // successful response
            /*
            data = {}
            */
        });
    }
}

/**
 * LocalMultipartUpload,
 * 파일을 CHUNK로 분할하여 로컬 서버에 업로드 시키는 함수,
 *
 * @requires [observePageLeave, deleteLocalFile, partUpload, sendEncodedByteData]
 *
 * @param {string} path 로컬에 업로드할 파일 경로
 * @param {File} file 로컬에 업로드할 파일 오브젝트
 * @param {function} completeCallback 성공시 UI를 수정하는 콜백 함수
 * @param {function} progressCallback 파일 업로드 진행시 진행상황 UI를 수정하는 콜백 함수
 * */
function localMultipartUpload(path, file, completeCallback, progressCallback) {
    let fileUploadInfo = new FileUploadInfo(file);
    const file_name = fileUploadInfo.uuid + file.name;

    observePageLeave(() => {
        deleteLocalFile(file_name);
    });
    partUpload();

    /**
     * PartUpload,
     * 로컬서버에 CHUNK를 업로드한 이후에 콜백 함수
     *
     * @requires [handleMultipartUploadComplete, sendEncodedByteData, handlePartUploadSuccess, handleMultipartUploadCancel, deleteLocalFile, handleMultipartUploadFail]
     *  */
    function partUpload() {
        const blob = file.slice(fileUploadInfo.byte_flag, Math.min(file.size, fileUploadInfo.byte_flag + CHUNK_SIZE));
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
            if (fileUploadInfo.byte_flag >= file.size) {
                handleMultipartUploadComplete();
                completeCallback(path + file_name);
                return;
            }

            const success = await sendEncodedByteData(reader.result);
            if (success && !fileUploadInfo.canceled) { // 전송 성공
                const progress_percent = Math.floor((fileUploadInfo.byte_flag / file.size) * 100);
                handlePartUploadSuccess(progress_percent);
                progressCallback(progress_percent, fileUploadInfo.byte_flag);

                fileUploadInfo.byte_flag += CHUNK_SIZE;
                fileUploadInfo.part_index += 1;
                partUpload();
            } else if (fileUploadInfo.canceled) { // 전송 취소
                handleMultipartUploadCancel();
                deleteLocalFile(file_name);
            } else { // 전송 실패
                handleMultipartUploadFail();
                deleteLocalFile(file_name);
            }
        }
    }

    /**
     * DeleteLocalFile,
     * 로컬서버에 업로드한 파일을 지우는 함수
     *
     * @param {string} file_name 로컬서버에서 지우려는 파일 이름
     * */
    function deleteLocalFile(file_name) {
        const data = {file_name};
        const options = {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json;'
            },
            body: JSON.stringify(data)
        }
        fetch('/local-delete', options)
            .then(res => res.json())
            .then(res => {
            })
            .catch(e => {
                console.error(e);
            });
    }

    /**
     * SendEncodedByteData,
     * 로컬서버에 업로드 할려는 파일의 데이터를 보내는 함수
     *
     * @param {string | ArrayBuffer} byte_data 로컬 서버로 보내려는 파일의 데이터
     * */
    function sendEncodedByteData(byte_data) {
        const data = {
            data: byte_data,
            file_name: file_name,
            part_index: fileUploadInfo.part_index
        };
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;'
            },
            body: JSON.stringify(data)
        }
        return fetch('/local-upload', options)
            .then(res => res.json())
            .then(res => res.data.status)
            .catch(e => {
                console.error(e);
                return false;
            });
    }
}

/**
 * MultipartUpload,
 * 로컬 또는 AWS 파일을 업로드하는 함수,
 * 로컬은 서버쪽 로직이 이미 존재하여하 한다.
 *
 * @version a.2
 * @requires [localMultipartUpload, awsMultipartUpload]
 *
 * @param {File | Blob} file 로컬 또는 AWS에 업로드할려는 파일
 * @param {function} completeCallback 성공시 UI를 수정하는 콜백 함수
 * @param {function} progressCallback 파일 업로드 진행시 진행상황 UI를 수정하는 콜백 함수
 * @param {string} path 로컬 서버 또는 AWS에 파일을 업로드할 때 필요한 PATH
 *
 * @example
 * multipartUpload({file: input.files[0], completeCallback: ()=>{}, progressCallback: ()=>{}, path: PATH});
 * */
function multipartUpload({
                             file,
                             completeCallback = () => {
                             },
                             progressCallback = () => {
                             },
                             path = '/files/'
                         }) {
    if (MULTIPART_UPLOAD_MODE === UPLOAD_MODE.LOCAL) {
        localMultipartUpload(path, file, completeCallback, progressCallback);
    } else if (MULTIPART_UPLOAD_MODE === UPLOAD_MODE.AWS) {
        awsMultipartUpload(path, file, completeCallback, progressCallback);
    }
}