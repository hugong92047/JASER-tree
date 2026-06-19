# JASER-tree
I do sth for my high school.

# Ran a test view locally before deployment

Make sure your machine have python installed

Linux / MacOS:
```bash
$ python3 -m http.server 8000
```

Windows:
```cmd
python -m http.server 8000
```

Go to your browser and open [localhost:8000](localhost:8000)

# Run parser

It is highly recommended to create a [virtual environment](https://docs.python.org/3/library/venv.html) before running the python script.

```bash
pip install -r requirements.txt
```

```bash
python prase.py path/to/your/file.xlsx
```

This parser script will overwrite `data.json` with the parsed data, if you have the test view server opened, just refresh the page
