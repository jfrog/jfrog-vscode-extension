import setuptools

setuptools.setup(
    name="example",
    version="2.2.2",
    install_requires=[
        'PyYAML',
        'fire==0.1.3',

            'matplotlib>=2.2.0,<2.4.0',
        'newrelic==2.0.*',
        'jupyter~=1.1.1',
        'numpy>=1.14.5'
    ]
)
