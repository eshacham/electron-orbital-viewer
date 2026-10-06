"""Writes a job's files to the data bucket under molecules/jobs/<key>/
(spec §5.3), which CloudFront already serves at /molecules/jobs/<key>/.

Result files and done.json use S3's conditional write (If-None-Match: *):
a root file, once written, is never replaced, even by a second worker
racing the first. Content types and cache headers match publish.py's, so
the app reads a computed molecule exactly as it reads the library.
"""
from botocore.exceptions import ClientError

from jobs.sink import ROOT_RESULT_NAMES

PREFIX = 'molecules/jobs'
IMMUTABLE = 'public, max-age=31536000, immutable'
NO_CACHE = 'no-cache'
CONTENT_TYPES = {'.json': 'application/json', '.gz': 'application/octet-stream',
                 '.py': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8',
                 '.xyz': 'text/plain; charset=utf-8'}
# D8 (preflight): the worker role has no s3:ListBucket, so S3 answers 403
# AccessDenied -- not 404 NoSuchKey -- for a key that simply does not exist.
# Both mean "missing" here; moto does not enforce IAM, so only a Stubber
# test can see the 403 branch exercised.
MISSING_CODES = ('NoSuchKey', '404', 'AccessDenied', '403')


def content_type(name: str) -> str:
    return CONTENT_TYPES.get(name[name.rfind('.'):], 'application/octet-stream')


class S3Sink:
    def __init__(self, bucket: str, client=None):
        if client is None:
            import boto3
            client = boto3.client('s3')
        self.bucket, self.s3 = bucket, client

    def _attempt_key(self, key, attempt, name):
        return f'{PREFIX}/{key}/attempts/{attempt}/{name}'

    def put_attempt(self, key, attempt, name, data):
        # Rewritten while an attempt runs (trajectory.xyz grows per step): never cached.
        self.s3.put_object(Bucket=self.bucket, Key=self._attempt_key(key, attempt, name), Body=data,
                           ContentType=content_type(name), CacheControl=NO_CACHE)

    def get_attempt(self, key, attempt, name):
        try:
            return self.s3.get_object(Bucket=self.bucket, Key=self._attempt_key(key, attempt, name))['Body'].read()
        except ClientError as e:
            if e.response['Error']['Code'] in MISSING_CODES:
                return None
            raise

    def put_result(self, key, name, data):
        try:
            self.s3.put_object(Bucket=self.bucket, Key=f'{PREFIX}/{key}/{name}', Body=data, IfNoneMatch='*',
                               ContentType=content_type(name), CacheControl=IMMUTABLE)
        except ClientError as e:
            if e.response['Error']['Code'] in ('PreconditionFailed', 'ConditionalRequestConflict'):
                raise FileExistsError(f's3://{self.bucket}/{PREFIX}/{key}/{name} already exists')
            raise

    def get_result(self, key, name):
        try:
            return self.s3.get_object(Bucket=self.bucket, Key=f'{PREFIX}/{key}/{name}')['Body'].read()
        except ClientError as e:
            if e.response['Error']['Code'] in MISSING_CODES:
                return None
            raise

    def put_done(self, key, data):
        self.put_result(key, 'done.json', data)

    def _root_exists(self, key, name):
        try:
            self.s3.head_object(Bucket=self.bucket, Key=f'{PREFIX}/{key}/{name}')
            return True
        except ClientError as e:
            if e.response['Error']['Code'] in MISSING_CODES:
                return False
            raise

    def clear_partial(self, key):
        # D7: a reclaimed or killed attempt can leave the root half-written
        # (no done.json), which makes every retry fail "already in the
        # result folder" (IfNoneMatch). done.json's presence is what says
        # the set is complete, so its absence is the only signal needed.
        # The bucket is versioned, so a delete only adds a marker.
        if self._root_exists(key, 'done.json'):
            return
        for name in ROOT_RESULT_NAMES:
            self.s3.delete_object(Bucket=self.bucket, Key=f'{PREFIX}/{key}/{name}')
