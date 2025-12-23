from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'message': 'Flask backend is running'})

@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({'message': 'Test endpoint working'})

if __name__ == '__main__':
    app.run(debug=True, port=5005)

