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
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Content-Type': 'application/json'
}


def field_value(field):
    if field.get('isNull'):
        return None
    for key in ('stringValue', 'longValue', 'doubleValue', 'booleanValue'):
        if key in field:
            return field[key]
    return None


def lambda_handler(event, context):
    authorizer = (event.get('requestContext') or {}).get('authorizer') or {}
    jwt_claims = (authorizer.get('jwt') or {}).get('claims') or {}
    investor_sub = jwt_claims.get('sub')

    if not investor_sub:
        return {'statusCode': 401, 'headers': CORS_HEADERS, 'body': json.dumps({'error': 'Not authenticated'})}

    sql = """
        SELECT i.id, i.deal_id, i.amount, i.current_value, i.status,
               d.title, d.location, d.est_yield, d.term_years
        FROM investments i
        JOIN deals d ON d.id = i.deal_id
        WHERE i.investor_sub = :investor_sub
        ORDER BY i.created_at DESC
    """

    try:
        result = rds_data.execute_statement(
            resourceArn=CLUSTER_ARN,
            secretArn=SECRET_ARN,
            database=DATABASE_NAME,
            sql=sql,
            parameters=[{'name': 'investor_sub', 'value': {'stringValue': investor_sub}}],
            includeResultMetadata=True
        )

        columns = [c['name'] for c in result['columnMetadata']]
        holdings = []
        for row in result['records']:
            r = {columns[i]: field_value(row[i]) for i in range(len(columns))}
            amount = r['amount']
            current_value = r['current_value'] if r['current_value'] is not None else amount
            holdings.append({
                'investment_id': r['id'],
                'deal_id': r['deal_id'],
                'title': r['title'],
                'location': r['location'],
                'amount': amount,
                'current_value': current_value,
                'est_yield': r['est_yield'],
                'term_years': r['term_years'],
                'status': r['status']
            })

        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': json.dumps({'holdings': holdings}, default=str)}

    except Exception as e:
        print('get-portfolio error:', e)
        return {'statusCode': 500, 'headers': CORS_HEADERS, 'body': json.dumps({'error': 'Internal error'})}
