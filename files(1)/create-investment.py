import boto3
import json
import os

rds_data = boto3.client('rds-data')

CLUSTER_ARN = os.environ['DB_CLUSTER_ARN']
SECRET_ARN = os.environ['DB_SECRET_ARN']
DATABASE_NAME = os.environ.get('DB_NAME', 'database-1')

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json'
}


def lambda_handler(event, context):
    try:
        body = json.loads(event.get('body') or '{}')
    except ValueError:
        return {'statusCode': 400, 'headers': CORS_HEADERS, 'body': json.dumps({'error': 'Invalid JSON body'})}

    deal_id = body.get('deal_id')
    amount = body.get('amount')

    # With an HTTP API JWT authorizer attached to this route, verified
    # claims land here — the investor's identity never comes from the body.
    authorizer = (event.get('requestContext') or {}).get('authorizer') or {}
    jwt_claims = (authorizer.get('jwt') or {}).get('claims') or {}
    investor_sub = jwt_claims.get('sub')

    if not investor_sub:
        return {'statusCode': 401, 'headers': CORS_HEADERS, 'body': json.dumps({'error': 'Not authenticated'})}
    if not deal_id or not amount or float(amount) < 100:
        return {'statusCode': 400, 'headers': CORS_HEADERS, 'body': json.dumps({'error': 'deal_id and amount (>= 100) are required'})}

    transaction_id = None
    try:
        txn = rds_data.begin_transaction(resourceArn=CLUSTER_ARN, secretArn=SECRET_ARN, database=DATABASE_NAME)
        transaction_id = txn['transactionId']

        deal_check = rds_data.execute_statement(
            resourceArn=CLUSTER_ARN,
            secretArn=SECRET_ARN,
            database=DATABASE_NAME,
            transactionId=transaction_id,
            sql="SELECT status FROM deals WHERE id = :id FOR UPDATE",
            parameters=[{'name': 'id', 'value': {'stringValue': deal_id}}]
        )
        if not deal_check['records']:
            rds_data.rollback_transaction(resourceArn=CLUSTER_ARN, secretArn=SECRET_ARN, transactionId=transaction_id)
            return {'statusCode': 404, 'headers': CORS_HEADERS, 'body': json.dumps({'error': 'Deal not found'})}
        status = deal_check['records'][0][0].get('stringValue')
        if status != 'open':
            rds_data.rollback_transaction(resourceArn=CLUSTER_ARN, secretArn=SECRET_ARN, transactionId=transaction_id)
            return {'statusCode': 409, 'headers': CORS_HEADERS, 'body': json.dumps({'error': 'This deal is no longer accepting investment'})}

        insert_result = rds_data.execute_statement(
            resourceArn=CLUSTER_ARN,
            secretArn=SECRET_ARN,
            database=DATABASE_NAME,
            transactionId=transaction_id,
            sql="""
                INSERT INTO investments (investor_sub, deal_id, amount, current_value, status)
                VALUES (:investor_sub, :deal_id, :amount, :amount, 'confirmed')
                RETURNING id, created_at
            """,
            parameters=[
                {'name': 'investor_sub', 'value': {'stringValue': investor_sub}},
                {'name': 'deal_id', 'value': {'stringValue': deal_id}},
                {'name': 'amount', 'value': {'doubleValue': float(amount)}}
            ],
            includeResultMetadata=True
        )

        rds_data.execute_statement(
            resourceArn=CLUSTER_ARN,
            secretArn=SECRET_ARN,
            database=DATABASE_NAME,
            transactionId=transaction_id,
            sql="UPDATE deals SET funding_raised = funding_raised + :amount, updated_at = now() WHERE id = :deal_id",
            parameters=[
                {'name': 'amount', 'value': {'doubleValue': float(amount)}},
                {'name': 'deal_id', 'value': {'stringValue': deal_id}}
            ]
        )

        rds_data.commit_transaction(resourceArn=CLUSTER_ARN, secretArn=SECRET_ARN, transactionId=transaction_id)

        new_id = insert_result['records'][0][0].get('stringValue')

        body_out = {
            'investment': {
                'id': new_id,
                'deal_id': deal_id,
                'amount': float(amount),
                'status': 'confirmed'
            }
        }
        return {'statusCode': 201, 'headers': CORS_HEADERS, 'body': json.dumps(body_out)}

    except Exception as e:
        print('create-investment error:', e)
        if transaction_id:
            try:
                rds_data.rollback_transaction(resourceArn=CLUSTER_ARN, secretArn=SECRET_ARN, transactionId=transaction_id)
            except Exception:
                pass
        return {'statusCode': 500, 'headers': CORS_HEADERS, 'body': json.dumps({'error': 'Internal error'})}
