import zipfile
import json

path = r'C:\Users\Muhaddas\.cache\huggingface\hub\models--DanishMubashar--chest-xray-pneumonia-detection-DenseNet121\snapshots\99ab42d4a6feb42ff8aaadb5e084589aacb3198e\pneumonia_detection_model.keras'

with zipfile.ZipFile(path, 'r') as z:
    config = json.loads(z.read('config.json'))
    layers = config['config']['layers']
    print('Sequential layers:')
    for i, layer in enumerate(layers):
        print(f'  {i}: {layer["class_name"]} - {layer["config"].get("name", "unnamed")}')
        if layer['class_name'] == 'Functional':
            print(f'    (Functional model with {len(layer["config"]["layers"])} layers)')
            for j, sublayer in enumerate(layer['config']['layers'][-5:]):
                print(f'      {j}: {sublayer["class_name"]} - {sublayer["config"].get("name", "unnamed")}')