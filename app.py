from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

datasets = {}
system_initialized = {}

DATASET_CONFIGS = {
    'sherlock': {
        'name': 'Sherlock Holmes QA',
        'file': 'data/a_study_in_scarlet.txt',
        'expert_role': 'You are an expert on Sherlock Holmes stories',
        'domain': 'the story'
    },
    'medical': {
        'name': 'FDA Drug Approvals QA',
        'file': 'data/medical_textbook.txt',
        'expert_role': 'You are a pharmaceutical expert specializing in recent FDA drug approvals',
        'domain': 'recent FDA drug approval data (2023-2024)'
    }
}


def initialize_dataset(dataset_id):
    global datasets, system_initialized
    
    if system_initialized.get(dataset_id):
        return True
    
    config = DATASET_CONFIGS.get(dataset_id)
    if not config:
        return False
    
    print(f"Initializing {config['name']}...")
    
    try:
        from data_processor import TextProcessor
        from knowledge_graph import KnowledgeGraphBuilder
        from rag_system import RAGSystem
        
        if not os.path.exists(config['file']):
            print(f"Error: File not found at {config['file']}")
            return False
        
        processor = TextProcessor(config['file'])
        chunks = processor.process_text()
        
        kg_builder = KnowledgeGraphBuilder()
        knowledge_graph = kg_builder.build_graph(chunks)
        
        rag_system = RAGSystem(
            chunks, 
            knowledge_graph, 
            expert_role=config.get('expert_role', 'You are a knowledgeable assistant'),
            domain=config.get('domain', 'the provided information')
        )
        
        datasets[dataset_id] = {
            'chunks': chunks,
            'knowledge_graph': knowledge_graph,
            'rag_system': rag_system
        }
        
        system_initialized[dataset_id] = True
        print(f"{config['name']} ready!")
        return True
        
    except Exception as e:
        print(f"Error: {e}")
        return False


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/sherlock')
def sherlock():
    return render_template('sherlock.html')


@app.route('/medical')
def medical():
    return render_template('medical.html')


@app.route('/api/<dataset_id>/initialize', methods=['POST'])
def api_initialize(dataset_id):
    if system_initialized.get(dataset_id):
        return jsonify({'success': True, 'stats': get_stats(dataset_id)})
    
    if initialize_dataset(dataset_id):
        return jsonify({'success': True, 'stats': get_stats(dataset_id)})
    
    return jsonify({'success': False, 'message': 'Initialization failed'}), 500


@app.route('/api/<dataset_id>/ask', methods=['POST'])
def api_ask(dataset_id):
    if not system_initialized.get(dataset_id):
        return jsonify({'success': False, 'error': 'System not initialized'}), 400
    
    question = request.get_json().get('question', '').strip()
    
    if not question:
        return jsonify({'success': False, 'error': 'No question provided'}), 400
    
    try:
        answer = datasets[dataset_id]['rag_system'].answer(question)
        return jsonify({
            'success': True,
            'question': question,
            'answer': answer
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def get_stats(dataset_id):
    if not system_initialized.get(dataset_id):
        return {}
    
    dataset = datasets[dataset_id]
    return {
        'num_chunks': len(dataset['chunks']),
        'num_entities': len(dataset['knowledge_graph']['entities']),
        'num_relationships': len(dataset['knowledge_graph']['relationships'])
    }


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, threaded=False)
