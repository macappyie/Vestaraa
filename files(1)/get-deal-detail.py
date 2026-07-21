import boto3
import json
import os
from decimal import Decimal

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


def row_to_dict(columns, row):
    return {columns[i]: field_value(row[i]) for i in range(len(columns))}


def lambda_handler(event, context):
    path_params = event.get('pathParameters') or {}
    deal_id = path_params.get('id')

    if not deal_id:
        return {'statusCode': 400, 'headers': CORS_HEADERS, 'body': json.dumps({'error': 'Missing deal id'})}

    sql = """
        SELECT id, title, location, property_type, est_yield, term_years,
               funding_goal, funding_raised, risk_rating, status, ai_analysis
        FROM deals WHERE id = :id
    """

    try:
        result = rds_data.execute_statement(
            resourceArn=CLUSTER_ARN,
            secretArn=SECRET_ARN,
            database=DATABASE_NAME,
            sql=sql,
            parameters=[{'name': 'id', 'value': {'stringValue': deal_id}}],
            includeResultMetadata=True
        )

        if not result['records']:
            return {'statusCode': 404, 'headers': CORS_HEADERS, 'body': json.dumps({'error': 'Deal not found'})}

        columns = [c['name'] for c in result['columnMetadata']]
        deal = row_to_dict(columns, result['records'][0])

        ai_analysis = None
        if deal.get('ai_analysis'):
            try:
                ai_analysis = json.loads(deal['ai_analysis'])
            except (TypeError, ValueError):
                ai_analysis = None

        body = {
            'deal': {
                'id': deal['id'],
                'title': deal['title'],
                'location': deal['location'],
                'property_type': deal['property_type'],
                'est_yield': deal['est_yield'],
                'term_years': deal['term_years'],
                'funding_goal': deal['funding_goal'],
                'funding_raised': deal['funding_raised'],
                'risk_rating': deal['risk_rating'],
                'status': deal['status'],
                'ai_analysis': ai_analysis
            }
        }
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': json.dumps(body, default=str)}

    except Exception as e:
        print('get-deal-detail error:', e)
        return {'statusCode': 500, 'headers': CORS_HEADERS, 'body': json.dumps({'error': 'Internal error'})}
