import setuptools

def get_requires(filename):
    requirements = []
    with open(filename, "rt") as req_file:
        for line in req_file.read().splitlines():
            if not line.strip().startswith("#"):
                requirements.append(line)
    return requirements

project_requirements = get_requires("requirements.txt")
setuptools.setup(
    name="snake",
    version="2.2.2",
    install_requires=project_requirements
)
