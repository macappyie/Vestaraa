import boto3
import json
import os
from decimal import Decimal

# RDS Data API client
rds_data = boto3.client('rds-data')

# These come from environment variables (set in Lambda config)
CLUSTER_ARN = os.environ['DB_CLUSTER_ARN']
SECRET_ARN = os.environ['DB_SECRET_ARN']
DATABASE_NAME = os.environ.get('DB_NAME', 'database-1')


def decimal_default(obj):
    """Helper to convert Decimal (from Postgres) into JSON-safe numbers."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError


def lambda_handler(event, context):
    try:
        sql = """
            SELECT id, title, location, property_type, est_yield,
                   funding_goal, funding_raised, term_years, status
            FROM deals
            WHERE status = 'active'
            ORDER BY created_at DESC;
        """

        response = rds_data.execute_statement(
            resourceArn=CLUSTER_ARN,
            secretArn=SECRET_ARN,
            database=DATABASE_NAME,
            sql=sql,
            formatRecordsAs='JSON'  # returns clean JSON instead of raw field arrays
        )

        deals = json.loads(response['formattedRecords'])

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'  # allows frontend to call this API
            },
            'body': json.dumps({'deals': deals}, default=decimal_default)
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }
